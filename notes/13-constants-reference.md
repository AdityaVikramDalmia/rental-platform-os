# Constants Reference

> Single source of truth for all enums, permissions, audit actions, config keys, and UI constants. Coding agents: import from `lib/constants.ts` and reference this doc.

---

## Status Enums

### Society Status

| Value        | Description                            |
| ------------ | -------------------------------------- |
| `ONBOARDING` | Just created, no buildings yet         |
| `ACTIVE`     | Operational, guards can submit leads   |
| `INACTIVE`   | Paused, guards cannot submit new leads |

### Building Status

| Value      | Description |
| ---------- | ----------- |
| `ACTIVE`   | Operational |
| `INACTIVE` | Paused      |

### Guard/User Status

| Value      | Can Login | Can Submit Leads   | Can Handle Visits |
| ---------- | --------- | ------------------ | ----------------- |
| `ACTIVE`   | Yes       | Yes (rate-limited) | Yes               |
| `INACTIVE` | Yes       | No                 | No                |
| `BANNED`   | No        | No                 | No                |

### Lead Status

| Value                 | Color (Tailwind)                | Badge Variant | Terminal? |
| --------------------- | ------------------------------- | ------------- | --------- |
| `SUBMITTED`           | `bg-blue-100 text-blue-700`     | default       | No        |
| `NEED_INFO`           | `bg-amber-100 text-amber-700`   | warning       | No        |
| `POTENTIAL_DUPLICATE` | `bg-yellow-100 text-yellow-700` | warning       | No        |
| `VERIFIED`            | `bg-green-100 text-green-700`   | success       | No        |
| `REJECTED`            | `bg-red-100 text-red-700`       | destructive   | Yes       |
| `DUPLICATE`           | `bg-gray-100 text-gray-500`     | secondary     | Yes       |

### Visit Status

| Value         | Color (Tailwind)                | Badge Variant | Terminal? |
| ------------- | ------------------------------- | ------------- | --------- |
| `ASSIGNED`    | `bg-blue-100 text-blue-700`     | default       | No        |
| `CONFIRMED`   | `bg-indigo-100 text-indigo-700` | default       | No        |
| `IN_PROGRESS` | `bg-amber-100 text-amber-700`   | warning       | No        |
| `COMPLETED`   | `bg-green-100 text-green-700`   | success       | Yes       |
| `CANCELLED`   | `bg-gray-100 text-gray-500`     | secondary     | Yes       |
| `NO_SHOW`     | `bg-red-100 text-red-700`       | destructive   | Yes       |

### Visit Outcome (set on COMPLETED)

| Value            | Emoji | Description                       |
| ---------------- | ----- | --------------------------------- |
| `INTERESTED`     | 😊    | Tenant wants to proceed           |
| `NOT_INTERESTED` | 😐    | Tenant passed                     |
| `FOLLOWUP`       | 🔄    | Tenant wants to think / come back |

### Listing Status

| Value       | Color (Tailwind)              | Badge Variant | Description       |
| ----------- | ----------------------------- | ------------- | ----------------- |
| `DRAFT`     | `bg-gray-100 text-gray-600`   | secondary     | Not public yet    |
| `PUBLISHED` | `bg-green-100 text-green-700` | success       | Public URL active |
| `ARCHIVED`  | `bg-gray-100 text-gray-500`   | outline       | Taken down        |

### Closure Status

| Value       | Color (Tailwind)              | Terminal? |
| ----------- | ----------------------------- | --------- |
| `PENDING`   | `bg-amber-100 text-amber-700` | No        |
| `CONFIRMED` | `bg-green-100 text-green-700` | Yes       |
| `CANCELLED` | `bg-red-100 text-red-700`     | Yes       |

### Payout Status

| Value       | Color (Tailwind)                | Terminal? |
| ----------- | ------------------------------- | --------- |
| `pending`   | `bg-blue-100 text-blue-700`     | No        |
| `approved`  | `bg-indigo-100 text-indigo-700` | No        |
| `disbursed` | `bg-green-100 text-green-700`   | Yes       |
| `failed`    | `bg-red-100 text-red-700`       | Yes       |
| `voided`    | `bg-gray-100 text-gray-500`     | Yes       |

### Owner Verification Call Outcome

| Value         | Description                         |
| ------------- | ----------------------------------- |
| `VERIFIED`    | Owner confirmed vacancy + details   |
| `UNREACHABLE` | No answer / phone off               |
| `DECLINED`    | Owner doesn't want DemoRentals involved |
| `FALSE`       | Vacancy info was wrong              |

## Owner Entity

### Owner Lifecycle Stage

| Value      | Description                                              | Terminal? |
| ---------- | -------------------------------------------------------- | --------- |
| `PROSPECT` | Owner captured from lead/request, not yet verified       | No        |
| `VERIFIED` | At least one linked lead verified                        | No        |
| `ACTIVE`   | Owner has active listing/deal activity                   | No        |
| `MANAGED`  | Owner is under ongoing RM management                     | No        |
| `DORMANT`  | No recent owner activity; can reactivate on new activity | No        |
| `CHURNED`  | Explicitly marked churned by admin                       | Yes       |

### Owner Source

| Value                   | Description                            |
| ----------------------- | -------------------------------------- |
| `GUARD_LEAD`            | First seen from a guard-submitted lead |
| `OWNER_SERVICE_REQUEST` | First seen from owner services request |
| `OPS_CREATED`           | Manually created by ops/admin          |

### Owner Lifecycle Transitions

| From       | Allowed To               |
| ---------- | ------------------------ |
| `PROSPECT` | `VERIFIED`, `CHURNED`    |
| `VERIFIED` | `ACTIVE`, `CHURNED`      |
| `ACTIVE`   | `MANAGED`, `CHURNED`     |
| `MANAGED`  | `DORMANT`, `CHURNED`     |
| `DORMANT`  | `ACTIVE`, `CHURNED`      |
| `CHURNED`  | _(none; terminal stage)_ |

### Owner Permissions

| Permission                | Description                                |
| ------------------------- | ------------------------------------------ |
| `owners.view`             | View owner list and owner detail data      |
| `owners.create`           | Create owner records from admin operations |
| `owners.edit`             | Edit owner profile fields                  |
| `owners.merge`            | Merge duplicate owner profiles             |
| `owners.manage_lifecycle` | Change owner lifecycle stage               |

### RM Assignment Status

| Value        | Label      | Terminal? |
| ------------ | ---------- | --------- |
| `ACTIVE`     | Active     | No        |
| `WARNING`    | Warning    | No        |
| `ESCALATED`  | Escalated  | No        |
| `REASSIGNED` | Reassigned | Yes       |
| `ENDED`      | Ended      | Yes       |

### RM Assigned By

| Value    | Description                         |
| -------- | ----------------------------------- |
| `SYSTEM` | Auto-assigned by backend automation |
| `ADMIN`  | Assigned manually by admin/ops      |

### RM Check-In Type

| Value             | Description                       |
| ----------------- | --------------------------------- |
| `SCHEDULED`       | Periodic routine check-in         |
| `ISSUE`           | Owner reported issue              |
| `RE_LISTING`      | Re-engagement for re-listing flow |
| `OWNER_INITIATED` | Owner contacted RM                |
| `AD_HOC`          | Unscheduled proactive outreach    |

### RM Check-In Method

| Value       | Description         |
| ----------- | ------------------- |
| `CALL`      | Voice call          |
| `WHATSAPP`  | WhatsApp chat/call  |
| `IN_PERSON` | In-person visit     |
| `OTHER`     | Other communication |

### RM Check-In Outcome

| Value       | Description                        |
| ----------- | ---------------------------------- |
| `RESOLVED`  | Issue/goal resolved                |
| `PENDING`   | Follow-up still required           |
| `ESCALATED` | Escalation required from admin/ops |

### RM Status Transitions

| From         | Allowed To                                    |
| ------------ | --------------------------------------------- |
| `ACTIVE`     | `WARNING`, `ESCALATED`, `REASSIGNED`, `ENDED` |
| `WARNING`    | `ACTIVE`, `ESCALATED`, `REASSIGNED`           |
| `ESCALATED`  | `ACTIVE`, `REASSIGNED`, `ENDED`               |
| `REASSIGNED` | _(none; terminal state)_                      |
| `ENDED`      | _(none; terminal state)_                      |

## Phase 30 Checklist Enums

### Checklist Depth

| Value    | Label  | Description                                  |
| -------- | ------ | -------------------------------------------- |
| `LIGHT`  | Light  | Quick inspection pass for key room checks    |
| `MEDIUM` | Medium | Standard inspection with deeper validation   |
| `FULL`   | Full   | Comprehensive inspection + compliance checks |

### Checklist Status

| Value                | Label              | Description                         |
| -------------------- | ------------------ | ----------------------------------- |
| `ASSIGNED`           | Assigned           | Checklist assigned to guard         |
| `IN_PROGRESS`        | In Progress        | Guard has started filling responses |
| `SUBMITTED`          | Submitted          | Guard submitted for admin review    |
| `UNDER_REVIEW`       | Under Review       | Admin is currently reviewing        |
| `APPROVED`           | Approved           | Accepted by admin                   |
| `REJECTED`           | Rejected           | Rejected by admin                   |
| `REVISION_REQUESTED` | Revision Requested | Sent back to guard for corrections  |

### Condition Rating

| Value       | Label     | Description                         |
| ----------- | --------- | ----------------------------------- |
| `EXCELLENT` | Excellent | No visible issues                   |
| `GOOD`      | Good      | Minor wear, acceptable condition    |
| `FAIR`      | Fair      | Noticeable wear, may need attention |
| `POOR`      | Poor      | Damaged or non-functional           |
| `NA`        | N/A       | Not applicable for this room/item   |

### Checklist Type

| Value                 | Label               | Description                            |
| --------------------- | ------------------- | -------------------------------------- |
| `PROPERTY_INSPECTION` | Property Inspection | Standard property inspection checklist |
| `MOVE_IN_HANDOVER`    | Move-in Handover    | Move-in/move-out handover checklist    |

### Checklist Item Type

| Value             | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| `CONDITION`       | Condition rating input                                     |
| `CHECKBOX`        | Boolean yes/no completion item                             |
| `TEXT`            | Free-text observation                                      |
| `NUMBER`          | Numeric capture (meter reading, count, etc.)               |
| `PHOTO`           | Photo-only evidence item                                   |
| `PHOTO_CONDITION` | Condition rating plus photo evidence in one checklist item |

### Document Requirement Type

| Value          | Label             | Description                                 |
| -------------- | ----------------- | ------------------------------------------- |
| `OWNER_DOCS`   | Owner Documents   | Documents collected from the property owner |
| `TENANT_DOCS`  | Tenant Documents  | Documents collected from the tenant         |
| `SOCIETY_DOCS` | Society Documents | Documents required by society/RWA           |

### Document Item Status

| Value       | Label     | Description                                         |
| ----------- | --------- | --------------------------------------------------- |
| `PENDING`   | Pending   | Item defined but not yet collected                  |
| `COLLECTED` | Collected | File uploaded and awaiting verification             |
| `VERIFIED`  | Verified  | Admin/OPS verified the submitted document           |
| `REJECTED`  | Rejected  | Submission rejected; re-upload required             |
| `NA`        | N/A       | Explicitly marked not applicable for this checklist |

### Document Overall Status

| Value         | Label       | Description                                            |
| ------------- | ----------- | ------------------------------------------------------ |
| `NOT_STARTED` | Not Started | All actionable items are still `PENDING`               |
| `IN_PROGRESS` | In Progress | At least one actionable item moved beyond `PENDING`    |
| `COMPLETE`    | Complete    | All actionable items are `VERIFIED` (or all are `NA`)  |
| `BLOCKED`     | Blocked     | At least one item is `REJECTED` and needs intervention |

### Regulatory Item Type

| Value                 | Label               | Description                               |
| --------------------- | ------------------- | ----------------------------------------- |
| `POLICE_VERIFICATION` | Police Verification | Tenant/police verification workflow       |
| `RENT_REGISTRATION`   | Rent Registration   | Rent agreement registration workflow      |
| `SOCIETY_NOC`         | Society NOC         | Society no-objection certificate workflow |
| `STAMP_DUTY`          | Stamp Duty          | Stamp duty payment/compliance tracking    |

### Regulatory Status

| Value         | Label       | Description                                      |
| ------------- | ----------- | ------------------------------------------------ |
| `NOT_STARTED` | Not Started | Work has not begun                               |
| `IN_PROGRESS` | In Progress | Work is currently in progress                    |
| `SUBMITTED`   | Submitted   | Submitted to authority/society and pending final |
| `APPROVED`    | Approved    | Compliance item completed successfully           |
| `REJECTED`    | Rejected    | Submission rejected; correction required         |
| `OVERDUE`     | Overdue     | SLA deadline breached                            |
| `WAIVED`      | Waived      | Requirement waived by approved policy/decision   |

## Phase 30 Incentive v2 Enums

### Quality Tier

| Value      | Label    | Score Range | Bounty Multiplier |
| ---------- | -------- | ----------- | ----------------- |
| `BRONZE`   | Bronze   | 0-49        | 1.0x              |
| `SILVER`   | Silver   | 50-74       | 1.25x             |
| `GOLD`     | Gold     | 75-89       | 1.5x              |
| `PLATINUM` | Platinum | 90-100      | 2.0x              |

Tier boundaries are configurable via `system_config` keys: `quality_tier_bronze_min`, `quality_tier_silver_min`, `quality_tier_gold_min`, `quality_tier_platinum_min`.

### Streak Type

| Value            | Label          | Description                                       |
| ---------------- | -------------- | ------------------------------------------------- |
| `DAILY_ACTIVE`   | Daily Active   | Guard had qualifying activity on consecutive days |
| `WEEKLY_WARRIOR` | Weekly Warrior | Guard met weekly targets for consecutive weeks    |
| `QUALITY_CHAIN`  | Quality Chain  | Consecutive checklists with score ≥ 90            |
| `PERFECT_10`     | Perfect 10     | Consecutive perfect completeness scores (100%)    |

### Penalty Type

| Value              | Label                    | Description                                                  |
| ------------------ | ------------------------ | ------------------------------------------------------------ |
| `LOW_COMPLETENESS` | Low Completeness         | Checklist completeness_score < 50 on linked visit            |
| `MISSING_PHOTOS`   | Missing Photos           | FULL-depth checklist submitted with mandatory photos missing |
| `FALSE_LEAD`       | False Lead               | Lead REJECTED with reason "false information"                |
| `NO_SHOW`          | No Show                  | Guard had a NO_SHOW visit within the lookback window         |
| `CONSECUTIVE_POOR` | Consecutive Poor Quality | Last 3 checklists all had completeness_score < 60            |

### Bonus Type

| Value               | Label             | Description                                         |
| ------------------- | ----------------- | --------------------------------------------------- |
| `FULL_CHECKLIST`    | Full Checklist    | All checklist items completed with full responses   |
| `ALL_GPS_PHOTOS`    | All GPS Photos    | All required photos include GPS metadata            |
| `WITHIN_SLA`        | Within SLA        | Visit started within the configured response window |
| `ALL_REQUIRED_DOCS` | All Required Docs | All required documents collected and verified       |
| `STREAK_MILESTONE`  | Streak Milestone  | Streak length reached a milestone (configurable)    |

See [Incentive V2](features/22-incentive-v2.md) for the full quality scoring and payout adjustment specification.

---

## Type Enums

### User Type

| Value    | Description                                                                                                                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GUARD`  | Society security guard (phone+password, `{phone}@guards.local`)                                                                                                                                                                                                            |
| `ADMIN`  | DemoRentals admin/super-admin team (Google SSO)                                                                                                                                                                                                                                  |
| `OPS`    | DemoRentals ops agent — field operations, checklists, document collection. Auth: phone+password (`{phone}@ops.local`) or Google SSO (when created with Google email). OPS can access `/admin/*` (permission-filtered sidebar) in addition to dedicated `(ops)/` portal. |
| `TENANT` | Prospective tenant (Google SSO)                                                                                                                                                                                                                                              |
| `OWNER`  | Property owner (Google SSO, ops-created)                                                                                                                                                                                                                                     |

### Backoffice User Types

| Constant                | Value              | Purpose                                                                                                              |
| ----------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `BACKOFFICE_USER_TYPES` | `["ADMIN", "OPS"]` | User types that can access the admin dashboard (`/admin/*`). Used by `isBackofficeUser()` and `requireBackoffice()`. |

| Helper                   | Signature                   | Purpose                                                                                    |
| ------------------------ | --------------------------- | ------------------------------------------------------------------------------------------ |
| `isBackofficeUser(type)` | `(type: string) => boolean` | Returns `true` if user type is in `BACKOFFICE_USER_TYPES`. Used in frontend layout checks. |

### Guard Type

| Value               | Description                           |
| ------------------- | ------------------------------------- |
| `BUILDING_SPECIFIC` | Stationed at a specific building      |
| `MAIN_GATE`         | Stationed at society entry/exit       |
| `PARK`              | Stationed at common areas             |
| `ROVING`            | Patrol guard, moves between locations |

### Shift Type

| Value       | Description               |
| ----------- | ------------------------- |
| `RECURRING` | Weekly repeating schedule |
| `OVERRIDE`  | One-off date override     |

### Location Type (Shifts)

| Value       | Description                              |
| ----------- | ---------------------------------------- |
| `BUILDING`  | Specific building (requires building_id) |
| `MAIN_GATE` | Society main gate                        |
| `PARK`      | Garden/park/common area                  |
| `PARKING`   | Parking area                             |
| `OTHER`     | Free text location                       |

### Availability Type (Leads)

| Value         | Description                              |
| ------------- | ---------------------------------------- |
| `VACANT_NOW`  | Flat is currently vacant                 |
| `VACANT_FROM` | Flat will be vacant from a specific date |

### Furnishing

| Value             | Display         |
| ----------------- | --------------- |
| `UNFURNISHED`     | Unfurnished     |
| `SEMI_FURNISHED`  | Semi-Furnished  |
| `FULLY_FURNISHED` | Fully Furnished |

### BHK Config (Listings)

| Value    | Display |
| -------- | ------- |
| `1BHK`   | 1 BHK   |
| `2BHK`   | 2 BHK   |
| `3BHK`   | 3 BHK   |
| `4BHK`   | 4 BHK   |
| `STUDIO` | Studio  |
| `OTHER`  | Other   |

### Parking (Listings)

| Value     | Display        |
| --------- | -------------- |
| `NONE`    | No Parking     |
| `COVERED` | Covered        |
| `OPEN`    | Open           |
| `BOTH`    | Covered + Open |

### Payout Method

| Value           | Display       |
| --------------- | ------------- |
| `CASH`          | Cash          |
| `UPI`           | UPI           |
| `BANK_TRANSFER` | Bank Transfer |

### Incentive Card Type

| Value             | Description                        |
| ----------------- | ---------------------------------- |
| `lead_milestone`  | Lead-count milestone reward card   |
| `visit_milestone` | Visit-count milestone reward card  |
| `quality_streak`  | Sustained-quality streak reward    |
| `speed_bonus`     | Fast turnaround bonus card         |
| `monthly_top`     | Monthly leaderboard top-rank award |

### Incentive Level

| Value      | Icon | Typical Threshold (Lead Submitter) |
| ---------- | ---- | ---------------------------------- |
| `BRONZE`   | 🥉   | 10                                 |
| `SILVER`   | 🥈   | 25                                 |
| `GOLD`     | 🥇   | 50                                 |
| `PLATINUM` | 💎   | 100                                |

### Incentive Award Method

| Value    | Description                                  |
| -------- | -------------------------------------------- |
| `AUTO`   | System-suggested, pending admin confirmation |
| `MANUAL` | Admin-awarded, immediately active            |

### Listing Inquiry Source

| Value            | Description                                    |
| ---------------- | ---------------------------------------------- |
| `CONTACT_FORM`   | User filled out the inquiry form               |
| `WHATSAPP_CLICK` | User clicked WhatsApp button (analytics event) |

### Audit Actor Type

| Value    | Description                                                   |
| -------- | ------------------------------------------------------------- |
| `GUARD`  | Action performed by a guard                                   |
| `ADMIN`  | Action performed by an admin                                  |
| `OPS`    | Action performed by an OPS agent                              |
| `TENANT` | Action performed by a tenant                                  |
| `OWNER`  | Action performed by an owner                                  |
| `SYSTEM` | Automated system action (de-dup, auto-suggestions, cron jobs) |

### Quality Flags (on Leads)

| Flag                    | Trigger   | Description                                |
| ----------------------- | --------- | ------------------------------------------ |
| `DUPLICATE_FLAT_MATCH`  | Auto      | Same building + flat exists within 90 days |
| `DUPLICATE_PHONE_MATCH` | Auto      | Same owner phone in society within 30 days |
| `GUARD_HIGH_REJECTION`  | Auto      | Submitting guard has >50% rejection rate   |
| `OFF_SHIFT_SUBMISSION`  | Auto (V2) | Guard submitted from unassigned building   |

### Language Preference

| Value      | Display        |
| ---------- | -------------- |
| `en`       | English        |
| `hi`       | Hindi (हिन्दी) |
| `hinglish` | Hinglish       |

---

## Permissions (RBAC)

### Society & Building

| Permission         | Description                         |
| ------------------ | ----------------------------------- |
| `societies.view`   | View society list and details       |
| `societies.create` | Create new societies                |
| `societies.edit`   | Edit society details, change status |
| `societies.delete` | Delete a society                    |
| `buildings.view`   | View buildings within societies     |
| `buildings.create` | Add buildings to a society          |
| `buildings.edit`   | Edit building details               |
| `buildings.delete` | Delete a building                   |

### Guard Management

| Permission              | Description                          |
| ----------------------- | ------------------------------------ |
| `guards.view`           | View guard list, profiles, shifts    |
| `guards.create`         | Create new guard accounts            |
| `guards.edit`           | Edit guard profile, type, society    |
| `guards.manage_status`  | Set guard ACTIVE / INACTIVE / BANNED |
| `guards.manage_shifts`  | Create/edit/delete guard shifts      |
| `guards.reset_password` | Reset a guard's password             |

### Lead Management

| Permission             | Description                                   |
| ---------------------- | --------------------------------------------- |
| `leads.view`           | View lead queue and details                   |
| `leads.request_info`   | Mark lead as NEED_INFO + add notes            |
| `leads.verify`         | Open verification form, complete verification |
| `leads.reject`         | Reject a lead (with reason)                   |
| `leads.mark_duplicate` | Finalize a lead as DUPLICATE                  |
| `leads.set_bounty`     | Set/edit prospective bounty                   |

### Listing Management

| Permission                | Description                         |
| ------------------------- | ----------------------------------- |
| `listings.view`           | View listings                       |
| `listings.create`         | Create listing from verified lead   |
| `listings.edit`           | Edit listing details, photos        |
| `listings.publish`        | Toggle DRAFT / PUBLISHED / ARCHIVED |
| `listings.view_inquiries` | View contact form submissions       |

### Trust Badge Management (P33)

| Permission            | Description                                    |
| --------------------- | ---------------------------------------------- |
| `trust_badges.view`   | View listing trust badges and freshness states |
| `trust_badges.manage` | Manual/admin-triggered trust badge recomputes  |

### Tenant Inquiry Management

| Permission                | Description                              |
| ------------------------- | ---------------------------------------- |
| `tenant_inquiries.view`   | View tenant inquiry queue and details    |
| `tenant_inquiries.manage` | Review, post bounty, assign guard, close |

### Visit Management

| Permission      | Description                        |
| --------------- | ---------------------------------- |
| `visits.view`   | View visit board                   |
| `visits.create` | Schedule a new visit               |
| `visits.edit`   | Edit visit details, reassign guard |
| `visits.cancel` | Cancel a visit                     |

### Closure & Payout

| Permission         | Description                            |
| ------------------ | -------------------------------------- |
| `closures.view`    | View closures                          |
| `closures.create`  | Create a closure record                |
| `closures.edit`    | Edit closure details, upload documents |
| `closures.confirm` | Confirm closure (PENDING → CONFIRMED)  |
| `payouts.view`     | View payout records                    |
| `payouts.create`   | Initiate a payout                      |
| `payouts.approve`  | Approve a payout (pending → approved)  |
| `payouts.disburse` | Mark payout as disbursed               |
| `payouts.void`     | Void a payout (pending → voided)       |

### RM Management

| Permission    | Description                                          |
| ------------- | ---------------------------------------------------- |
| `rm.view`     | View RM assignments and check-in history             |
| `rm.manage`   | Create assignments and update RM assignment statuses |
| `rm.reassign` | Reassign an owner from one RM to another             |
| `rm.check_in` | Record RM check-ins                                  |

### Incentive Management

| Permission          | Description                            |
| ------------------- | -------------------------------------- |
| `incentives.view`   | View incentive cards and card history  |
| `incentives.award`  | Manually award incentive cards         |
| `incentives.expire` | Expire active cards                    |
| `incentives.manage` | Manage incentive rules and card states |

### Incentive v3 Management (P32)

| Permission             | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `commission.configure` | Configure commission engine defaults and modifier templates |
| `commission.view`      | View commission evaluations and simulation outputs          |
| `attribution.compute`  | Trigger attribution computations                            |
| `attribution.dispute`  | Raise/manage attribution disputes                           |
| `attribution.override` | Apply admin overrides to attribution results                |
| `attribution.view`     | View attribution records and split previews                 |
| `gamification.manage`  | Manage quests, XP rules, and badge grant workflows          |
| `gamification.view`    | View gamification profiles, levels, streaks, and quests     |
| `shadow_mode.view`     | View shadow-mode delta reports                              |
| `shadow_mode.manage`   | Manage shadow-mode rollout/decommission controls            |
| `disbursement.approve` | Approve commission disbursements                            |
| `disbursement.void`    | Void failed/incorrect commission disbursements              |

### Negotiation & Transaction Rails (P26/P34)

| Permission            | Description                                         |
| --------------------- | --------------------------------------------------- |
| `negotiations.view`   | View negotiation queue and negotiation detail rooms |
| `negotiations.manage` | Manage negotiation state, terms, checklist, tokens  |
| `transactions.view`   | View rental transaction rails and timelines         |
| `transactions.manage` | Manage transaction lifecycle transitions            |
| `kyc.verify`          | Verify/reject KYC packets                           |
| `agreements.generate` | Generate/regenerate rental agreements               |
| `agreements.sign`     | Record/complete agreement signing flow              |

### Owner Services, Support & Notifications

| Permission                      | Description                                          |
| ------------------------------- | ---------------------------------------------------- |
| `owner_service_requests.view`   | View owner service request queue                     |
| `owner_service_requests.manage` | Manage owner service request lifecycle               |
| `support_inquiries.view`        | View support inbox                                   |
| `support_inquiries.manage`      | Manage support inquiry lifecycle                     |
| `notifications.view`            | View notification events and monitor status          |
| `notifications.manage`          | Manage notification operations and delivery controls |
| `notification_templates.manage` | Manage notification templates                        |

### Analytics & Audit

| Permission       | Description                                 |
| ---------------- | ------------------------------------------- |
| `quality.view`   | View quality metrics, flags, and scorecards |
| `analytics.view` | View analytics dashboards                   |
| `audit.view`     | View audit log                              |

### System Administration

| Permission         | Description                               |
| ------------------ | ----------------------------------------- |
| `roles.view`       | View roles and assignments                |
| `roles.manage`     | Create/edit/delete roles, assign to users |
| `users.manage`     | Manage user records across personas       |
| `admins.create`    | Create new admin accounts                 |
| `admins.edit`      | Edit admin accounts                       |
| `system.configure` | Edit system config                        |

### Referral Management

| Permission                 | Description                                 |
| -------------------------- | ------------------------------------------- |
| `referrals.view`           | View referral records and analytics         |
| `referrals.manage`         | Manage referral attribution, void referrals |
| `referrals.configure`      | Configure referral bonus amounts and splits |
| `referrals.approve_payout` | Approve referral milestone payouts          |

### Chat

| Permission      | Description                                      |
| --------------- | ------------------------------------------------ |
| `chat.view`     | View chat channels and messages                  |
| `chat.send`     | Send chat messages                               |
| `chat.moderate` | Moderate flagged messages and admin review queue |
| `chat.admin`    | Admin-only chat controls (archive/review/config) |

### Deal Checklist Management

| Permission                | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| `deal_checklists.view`    | View deal checklists and approval status                      |
| `deal_checklists.manage`  | Create, edit, share, regenerate checklists                    |
| `deal_checklists.approve` | (Reserved — sign-off currently uses party identity, not RBAC) |
| `owner_invites.manage`    | Generate, regenerate, and inspect owner invites               |

---

## Audit Action Strings

### Society & Building

| Action             | Trigger                              |
| ------------------ | ------------------------------------ |
| `SOCIETIES_INSERT` | Society created                      |
| `SOCIETIES_UPDATE` | Society updated (name, status, etc.) |
| `BUILDINGS_INSERT` | Building created                     |
| `BUILDINGS_UPDATE` | Building updated                     |

### Users & Guards

| Action                  | Trigger                                            |
| ----------------------- | -------------------------------------------------- |
| `USERS_INSERT`          | User created (guard or admin)                      |
| `USERS_UPDATE`          | User status/details changed                        |
| `GUARD_PROFILES_INSERT` | Guard profile created                              |
| `GUARD_PROFILES_UPDATE` | Guard profile updated (type, society, photo, etc.) |
| `GUARD_SHIFTS_INSERT`   | Shift created                                      |
| `GUARD_SHIFTS_UPDATE`   | Shift updated                                      |
| `GUARD_SHIFTS_DELETE`   | Shift soft-deleted                                 |

### Leads

| Action         | Trigger                                                               |
| -------------- | --------------------------------------------------------------------- |
| `LEADS_INSERT` | Lead submitted by guard                                               |
| `LEADS_UPDATE` | Lead updated (status change, bounty set, notes added, guard resubmit) |

### Owners

| Action          | Trigger              |
| --------------- | -------------------- |
| `OWNERS_INSERT` | Owner entity created |
| `OWNERS_UPDATE` | Owner entity updated |

### Owner Verification

| Action                       | Trigger                    |
| ---------------------------- | -------------------------- |
| `OWNER_VERIFICATIONS_INSERT` | Verification call recorded |

### RM Assignments & Check-Ins

| Action                        | Trigger                                 |
| ----------------------------- | --------------------------------------- |
| `OWNER_RM_ASSIGNMENTS_INSERT` | RM assignment created                   |
| `OWNER_RM_ASSIGNMENTS_UPDATE` | RM assignment updated (status/reassign) |
| `RM_CHECK_INS_INSERT`         | RM check-in recorded                    |

### Listings

| Action            | Trigger                                  |
| ----------------- | ---------------------------------------- |
| `LISTINGS_INSERT` | Listing created                          |
| `LISTINGS_UPDATE` | Listing updated (details, status change) |

### Visits

| Action          | Trigger                                      |
| --------------- | -------------------------------------------- |
| `VISITS_INSERT` | Visit created                                |
| `VISITS_UPDATE` | Visit updated (status, reschedule, reassign) |

### Closures & Payouts

| Action            | Trigger                             |
| ----------------- | ----------------------------------- |
| `CLOSURES_INSERT` | Closure created                     |
| `CLOSURES_UPDATE` | Closure confirmed/cancelled/updated |
| `PAYOUTS_INSERT`  | Payout initiated                    |
| `PAYOUTS_UPDATE`  | Payout approved/paid                |

### Incentives

| Action                   | Trigger                                    |
| ------------------------ | ------------------------------------------ |
| `INCENTIVE_CARDS_INSERT` | Card suggested or manually awarded         |
| `INCENTIVE_CARDS_UPDATE` | Card confirmed, revoked, or status changed |

### RBAC & Config

| Action                         | Trigger                          |
| ------------------------------ | -------------------------------- |
| `ROLES_INSERT`                 | Role created                     |
| `ROLES_UPDATE`                 | Role updated                     |
| `USER_ROLE_ASSIGNMENTS_INSERT` | Role assigned                    |
| `USER_ROLE_ASSIGNMENTS_UPDATE` | Assignment removed (soft delete) |
| `SYSTEM_CONFIG_INSERT`         | Config entry created             |
| `SYSTEM_CONFIG_UPDATE`         | Config value changed             |

### Documents & Regulatory

| Action                         | Trigger                                               |
| ------------------------------ | ----------------------------------------------------- |
| `DOCUMENT_REQUIREMENTS_INSERT` | Document requirement bundle created                   |
| `DOCUMENT_REQUIREMENTS_UPDATE` | Document requirement updated (item status/notes/file) |
| `REGULATORY_ITEMS_INSERT`      | Regulatory item created                               |
| `REGULATORY_ITEMS_UPDATE`      | Regulatory item updated (status/deadline/assignment)  |

### Field Ops (P30)

| Action                         | Trigger                           |
| ------------------------------ | --------------------------------- |
| `CHECKLIST_TEMPLATES_INSERT`   | Checklist template created        |
| `CHECKLIST_TEMPLATES_UPDATE`   | Checklist template updated        |
| `CHECKLIST_INSTANCES_INSERT`   | Checklist instance created        |
| `CHECKLIST_INSTANCES_UPDATE`   | Checklist instance updated        |
| `QUALITY_SCORE_HISTORY_INSERT` | Quality score history row created |
| `QUALITY_SCORE_HISTORY_UPDATE` | Quality score history row updated |
| `GUARD_STREAKS_INSERT`         | Guard streak row created          |
| `GUARD_STREAKS_UPDATE`         | Guard streak row updated          |
| `PAYOUT_ADJUSTMENTS_INSERT`    | Payout adjustment row created     |
| `PAYOUT_ADJUSTMENTS_UPDATE`    | Payout adjustment row updated     |

### Referrals

| Action                       | Description              |
| ---------------------------- | ------------------------ |
| `REFERRAL_CODES_INSERT`      | Referral code generated  |
| `REFERRAL_CODES_UPDATE`      | Referral code updated    |
| `REFERRALS_INSERT`           | Referral recorded        |
| `REFERRALS_UPDATE`           | Referral status changed  |
| `REFERRAL_MILESTONES_INSERT` | Milestone triggered      |
| `REFERRAL_MILESTONES_UPDATE` | Milestone status changed |
| `REFERRAL_CONFIG_INSERT`     | Config created           |
| `REFERRAL_CONFIG_UPDATE`     | Config updated           |

### Tenant Inquiries

| Action                                 | Description                              |
| -------------------------------------- | ---------------------------------------- |
| `TENANT_INQUIRIES_INSERT`              | Tenant inquiry created                   |
| `TENANT_INQUIRIES_UPDATE`              | Tenant inquiry updated                   |
| `tenant_inquiry.negotiation_initiated` | Inquiry moved into negotiation lifecycle |

### Chat

| Action                        | Description                          |
| ----------------------------- | ------------------------------------ |
| `CHAT_CHANNELS_INSERT`        | Chat channel created                 |
| `CHAT_CHANNELS_UPDATE`        | Chat channel status updated          |
| `CHAT_MESSAGES_INSERT`        | Chat message inserted                |
| `CHAT_MESSAGES_UPDATE`        | Chat message status/content updated  |
| `CHAT_MESSAGE_BATCHES_INSERT` | Chat batch created                   |
| `CHAT_MESSAGE_BATCHES_UPDATE` | Chat batch processing status updated |
| `CHAT_READ_RECEIPTS_INSERT`   | User read receipt created            |
| `CHAT_READ_RECEIPTS_UPDATE`   | User read receipt updated            |

### Deal Room (P25)

| Action                             | Description                                   |
| ---------------------------------- | --------------------------------------------- |
| `OWNER_INVITES_INSERT`             | Owner invite generated                        |
| `OWNER_INVITES_UPDATE`             | Owner invite consumed/expired/regenerated     |
| `OWNER_INVITES_DELETE`             | Owner invite deleted                          |
| `DEAL_CHECKLISTS_INSERT`           | Checklist created                             |
| `DEAL_CHECKLISTS_UPDATE`           | Checklist shared/disputed/approved/superseded |
| `DEAL_CHECKLISTS_DELETE`           | Checklist deleted                             |
| `DEAL_CHECKLIST_SIGNATURES_INSERT` | Signature created                             |
| `DEAL_CHECKLIST_SIGNATURES_UPDATE` | Signature updated                             |
| `DEAL_CHECKLIST_SIGNATURES_DELETE` | Signature deleted                             |

### Negotiations (P26)

| Action                                | Description                            |
| ------------------------------------- | -------------------------------------- |
| `NEGOTIATIONS_INSERT`                 | Negotiation record created             |
| `NEGOTIATIONS_UPDATE`                 | Negotiation status/fields updated      |
| `NEGOTIATION_TERMS_PROPOSALS_INSERT`  | Negotiation proposal version created   |
| `NEGOTIATION_TERMS_PROPOSALS_UPDATE`  | Negotiation proposal status updated    |
| `NEGOTIATION_TERMS_SIGNATURES_INSERT` | Proposal sign-off signature recorded   |
| `NEGOTIATION_TOKEN_RECORDS_INSERT`    | Token collection/refund record created |
| `NEGOTIATION_TOKEN_RECORDS_UPDATE`    | Token record updated                   |

### Owner Services & Support

| Action                          | Description                   |
| ------------------------------- | ----------------------------- |
| `OWNER_SERVICE_REQUESTS_INSERT` | Owner service request created |
| `OWNER_SERVICE_REQUESTS_UPDATE` | Owner service request updated |
| `SUPPORT_INQUIRIES_INSERT`      | Support inquiry created       |
| `SUPPORT_INQUIRIES_UPDATE`      | Support inquiry updated       |

### Transaction Rails (P34)

| Action                       | Description                |
| ---------------------------- | -------------------------- |
| `RENTAL_TRANSACTIONS_INSERT` | Rental transaction created |
| `RENTAL_TRANSACTIONS_UPDATE` | Rental transaction updated |
| `RENTAL_AGREEMENTS_INSERT`   | Rental agreement created   |
| `RENTAL_AGREEMENTS_UPDATE`   | Rental agreement updated   |
| `KYC_PACKETS_INSERT`         | KYC packet created         |
| `KYC_PACKETS_UPDATE`         | KYC packet updated         |
| `TOKEN_BOOKINGS_INSERT`      | Token booking created      |
| `TOKEN_BOOKINGS_UPDATE`      | Token booking updated      |
| `DEPOSIT_RECORDS_INSERT`     | Deposit record created     |
| `DEPOSIT_RECORDS_UPDATE`     | Deposit record updated     |
| `HANDOVER_CHECKLISTS_INSERT` | Handover checklist created |
| `HANDOVER_CHECKLISTS_UPDATE` | Handover checklist updated |

### Notifications (P35)

| Action                            | Description                      |
| --------------------------------- | -------------------------------- |
| `NOTIFICATION_PREFERENCES_INSERT` | Notification preferences created |
| `NOTIFICATION_PREFERENCES_UPDATE` | Notification preferences updated |
| `NOTIFICATION_TEMPLATES_INSERT`   | Notification template created    |
| `NOTIFICATION_TEMPLATES_UPDATE`   | Notification template updated    |
| `NOTIFICATIONS_INSERT`            | Notification feed item created   |
| `NOTIFICATIONS_UPDATE`            | Notification feed item updated   |

### Incentive v3 & Trust (P32/P33)

| Action                                 | Description                                                 |
| -------------------------------------- | ----------------------------------------------------------- |
| `DEAL_CONTRIBUTIONS_CREATE`            | Contribution row created                                    |
| `DEAL_CONTRIBUTIONS_UPDATE`            | Contribution row updated                                    |
| `ATTRIBUTION_RECORDS_CREATE`           | Attribution record created                                  |
| `ATTRIBUTION_RECORDS_UPDATE`           | Attribution record updated                                  |
| `ATTRIBUTION_SPLITS_CREATE`            | Attribution split rows created                              |
| `INCENTIVE_DISBURSEMENTS_CREATE`       | Incentive disbursement created                              |
| `INCENTIVE_DISBURSEMENTS_UPDATE`       | Incentive disbursement updated                              |
| `GAMIFICATION_PROFILES_CREATE`         | Gamification profile created                                |
| `GAMIFICATION_PROFILES_UPDATE`         | Gamification profile updated                                |
| `GAMIFICATION_QUESTS_CREATE`           | Quest definition created                                    |
| `GAMIFICATION_QUESTS_UPDATE`           | Quest definition updated                                    |
| `USER_QUEST_PROGRESS_CREATE`           | User quest progress row created                             |
| `USER_QUEST_PROGRESS_UPDATE`           | User quest progress row updated                             |
| `TRUST_BADGE_COMPUTE`                  | Trust badge compute action logged                           |
| `TRUST_BADGE_UPDATE`                   | Trust badge update action logged                            |
| `COMMISSION_EVALUATE`                  | Commission evaluation run logged                            |
| `ATTRIBUTION_COMPUTE`                  | Attribution compute run logged                              |
| `DISBURSEMENT_CREATE`                  | Disbursement creation action logged                         |
| `DISBURSEMENT_APPROVE`                 | Disbursement approval action logged                         |
| `DISBURSEMENT_VOID`                    | Disbursement void action logged                             |
| `CONFIG_VERSION_ACTIVATE`              | Config version activated                                    |
| `CONFIG_VERSION_ARCHIVE`               | Config version archived                                     |
| `MODIFIER_TEMPLATE_CREATE`             | Modifier template created                                   |
| `MODIFIER_TEMPLATE_UPDATE`             | Modifier template updated                                   |
| `TENANT_INQUIRY_NEGOTIATION_INITIATED` | Audit action key for `tenant_inquiry.negotiation_initiated` |

**Note**: Most table triggers follow `{TABLE_NAME}_{OPERATION}`. A smaller set of workflow/action literals (e.g. `TRUST_BADGE_COMPUTE`, `COMMISSION_EVALUATE`, `DISBURSEMENT_APPROVE`) are explicitly defined in `AUDIT_ACTIONS`.

---

## System Config Keys

| Key                                            | Default Value                                                                                                 | Type    | Description                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------- |
| `max_leads_per_guard_per_day`                  | `5`                                                                                                           | number  | Rate limit for lead submissions (resets at midnight IST daily) |
| `dedup_flat_window_days`                       | `90`                                                                                                          | number  | Days to look back for flat de-dup                              |
| `dedup_phone_window_days`                      | `30`                                                                                                          | number  | Days to look back for phone de-dup                             |
| `incentive_lead_submitter_bronze`              | `10`                                                                                                          | number  | Verified leads for Bronze                                      |
| `incentive_lead_submitter_silver`              | `25`                                                                                                          | number  | Verified leads for Silver                                      |
| `incentive_lead_submitter_gold`                | `50`                                                                                                          | number  | Verified leads for Gold                                        |
| `incentive_lead_submitter_platinum`            | `100`                                                                                                         | number  | Verified leads for Platinum                                    |
| `incentive_visit_handler_bronze`               | `10`                                                                                                          | number  | Completed visits for Bronze                                    |
| `incentive_visit_handler_silver`               | `25`                                                                                                          | number  | Completed visits for Silver                                    |
| `incentive_visit_handler_gold`                 | `50`                                                                                                          | number  | Completed visits for Gold                                      |
| `incentive_visit_handler_platinum`             | `100`                                                                                                         | number  | Completed visits for Platinum                                  |
| `incentive_quality_champion_bronze`            | `70`                                                                                                          | number  | Verified rate % for Bronze                                     |
| `incentive_quality_champion_silver`            | `80`                                                                                                          | number  | Verified rate % for Silver                                     |
| `incentive_quality_champion_gold`              | `90`                                                                                                          | number  | Verified rate % for Gold                                       |
| `incentive_quality_champion_platinum`          | `95`                                                                                                          | number  | Verified rate % for Platinum                                   |
| `incentive_quality_champion_min_leads`         | `10`                                                                                                          | number  | Min leads before quality rate is meaningful                    |
| `quality_score_weights`                        | `{"lead_approval_rate":40,"visit_completion_rate":30,"flag_frequency":20,"speed_bonus":10}`                   | string  | JSON bundle of quality scoring component weights               |
| `quality_weight_checklist`                     | `30`                                                                                                          | number  | Checklist weight in quality score                              |
| `quality_weight_photo`                         | `25`                                                                                                          | number  | Photo evidence weight in quality score                         |
| `quality_weight_speed`                         | `20`                                                                                                          | number  | Speed/SLA weight in quality score                              |
| `quality_weight_verification`                  | `15`                                                                                                          | number  | Verification accuracy weight in quality score                  |
| `quality_weight_document`                      | `10`                                                                                                          | number  | Document completeness weight in quality score                  |
| `streak_bonus_3day_paise`                      | `20000`                                                                                                       | number  | 3-day streak bonus (paise)                                     |
| `streak_bonus_7day_paise`                      | `50000`                                                                                                       | number  | 7-day streak bonus (paise)                                     |
| `streak_bonus_14day_paise`                     | `100000`                                                                                                      | number  | 14-day streak bonus (paise)                                    |
| `streak_bonus_30day_paise`                     | `200000`                                                                                                      | number  | 30-day streak bonus (paise)                                    |
| `penalty_no_show_paise`                        | `20000`                                                                                                       | number  | Penalty amount for no-show linked events (paise)               |
| `min_quality_score_for_incentives`             | `50`                                                                                                          | number  | Minimum score required before incentive eligibility            |
| `demorentals_contact_phone`                        | `""`                                                                                                          | string  | 10-digit phone shown on public listing pages                   |
| `demorentals_whatsapp_phone`                       | `""`                                                                                                          | string  | 10-digit phone for WhatsApp button on listings                 |
| `chat_batch_window_ms`                         | `5000`                                                                                                        | number  | Message batch window (milliseconds) before AI rewrite triggers |
| `chat_ai_model`                                | `"gpt-4o-mini"`                                                                                               | string  | OpenAI model used for message rewriting                        |
| `chat_max_message_length`                      | `2000`                                                                                                        | number  | Hard max message size (characters)                             |
| `chat_owner_invite_expiry_days`                | `7`                                                                                                           | number  | Owner chat invite expiration window (days)                     |
| `chat_pii_fail_action`                         | `admin_review`                                                                                                | string  | Action when post-check still detects PII                       |
| `tenant_bounty_default_amount`                 | `50000`                                                                                                       | number  | Default bounty amount for tenant inquiries (paise)             |
| `tenant_bounty_expiry_days`                    | `3`                                                                                                           | number  | Active key: days until tenant inquiry bounty expires           |
| `tenant_bounty_default_expiry_days`            | `3`                                                                                                           | number  | Legacy compatibility alias for expiry days                     |
| `seed_demo_version`                            | `0`                                                                                                           | string  | Internal demo seed sentinel (`1.0` after `seedDemo:seedMega`)  |
| `negotiation_stale_days`                       | `7`                                                                                                           | number  | Days of inactivity before stale/escalation processing          |
| `negotiation_max_rounds`                       | `5`                                                                                                           | number  | Max proposal rounds before escalation                          |
| `negotiation_token_agreement_days`             | `3`                                                                                                           | number  | Days for post-token agreement completion window                |
| `trust_badge_freshness_threshold_days`         | `30`                                                                                                          | number  | Days before a listing transitions from fresh to stale          |
| `trust_badge_min_photos`                       | `5`                                                                                                           | number  | Minimum photos required for `REAL_PHOTOS` trust badge          |
| `notification_quiet_hours_start`               | `22:00`                                                                                                       | string  | Quiet hours start (`HH:MM`)                                    |
| `notification_quiet_hours_end`                 | `07:00`                                                                                                       | string  | Quiet hours end (`HH:MM`)                                      |
| `notification_dedup_window_ms`                 | `300000`                                                                                                      | number  | Event deduplication window in milliseconds                     |
| `notification_max_retries`                     | `3`                                                                                                           | number  | Max retry attempts per event                                   |
| `notification_retry_base_ms`                   | `2000`                                                                                                        | number  | Base backoff duration in milliseconds                          |
| `transaction_auto_cancel_days`                 | `14`                                                                                                          | number  | Auto-cancel threshold for stale non-terminal transactions      |
| `kyc_provider_timeout_ms`                      | `45000`                                                                                                       | number  | Timeout for KYC provider calls in milliseconds                 |
| `esign_deadline_days`                          | `5`                                                                                                           | number  | eSign deadline before agreement expiry handling                |
| `incentive_v3_active_config_version`           | `v3.0.0`                                                                                                      | string  | Active v3 config version                                       |
| `incentive_v3_feature_flags`                   | `{"shadow_mode":true,"split_preview_enabled":true,"disbursement_enabled":false,"gamification_enabled":false}` | string  | JSON feature-flag bundle for v3 capabilities                   |
| `incentive_v3_rollout_policy`                  | `{"mode":"OFF","enabled_personas":[],"notes":"v2 remains payout source of truth"}`                            | string  | JSON rollout policy (mode + enabled personas)                  |
| `incentive_v3_shadow_mode_enabled`             | `true`                                                                                                        | boolean | Global shadow mode toggle                                      |
| `incentive_v3_decommission_variance_threshold` | `5`                                                                                                           | number  | Max acceptable delta % for v2 decommission gating              |

**Storage format**: All values stored as JSON-encoded strings in the `value` field. Parse with `JSON.parse()` on read.

---

## Default Roles

### Super Admin (System Role)

All permissions. Cannot be deleted. Created by seed script.

### Ops Agent (System Role)

Cannot be deleted. Created by seed script. Assigned to users with `user_type: OPS` (OPS agents) as well as admin-level ops staff.

**Permissions**:

```
societies.view, buildings.view,
guards.view, guards.manage_shifts,
leads.view, leads.request_info, leads.verify, leads.reject, leads.mark_duplicate, leads.set_bounty,
listings.view, listings.create, listings.edit, listings.publish, listings.view_inquiries,
trust_badges.view,
visits.view, visits.create, visits.edit, visits.cancel,
closures.view, closures.create, closures.edit,
payouts.view,
incentives.view,
commission.view, attribution.view, gamification.view, shadow_mode.view,
tenant_inquiries.view, tenant_inquiries.manage,
negotiations.view, negotiations.manage,
transactions.view, transactions.manage,
kyc.verify, agreements.generate, agreements.sign,
owner_service_requests.view, owner_service_requests.manage,
notifications.view,
analytics.view
```

### Custom Roles

Super Admin can create additional roles with any combination of permissions. Examples:

| Role                | Permissions                                                                                                                                                                           | Use Case                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Lead Reviewer**   | `leads.view`, `leads.request_info`, `leads.verify`, `leads.reject`, `leads.mark_duplicate`                                                                                            | Can only review and triage leads           |
| **Finance**         | `closures.view`, `closures.confirm`, `payouts.view`, `payouts.create`, `payouts.approve`, `payouts.disburse`, `payouts.void`, `analytics.view`                                        | Handles money and financial reporting only |
| **Society Manager** | `societies.view`, `societies.create`, `societies.edit`, `buildings.view`, `buildings.create`, `buildings.edit`, `guards.view`, `guards.create`, `guards.edit`, `guards.manage_shifts` | Manages society onboarding and guard setup |

Custom roles are NOT system roles (`is_system_role: false`) and can be edited or deleted by Super Admin.

---

## Amenities List (Listings)

Standard amenity values for the multi-select chips on listing creation:

```
gym, pool, garden, security, lift, power_backup, clubhouse,
parking, play_area, jogging_track, intercom, cctv, fire_safety,
water_supply_24x7, gas_pipeline, rain_water_harvesting
```

---

---

## Tenant & Owner Enums

### Tenant Inquiry Status

| Value                   | Color (Tailwind)                | Badge Variant | Terminal? |
| ----------------------- | ------------------------------- | ------------- | --------- |
| `SUBMITTED`             | `bg-blue-100 text-blue-700`     | default       | No        |
| `REVIEWED`              | `bg-indigo-100 text-indigo-700` | default       | No        |
| `BOUNTY_POSTED`         | `bg-amber-100 text-amber-700`   | warning       | No        |
| `GUARD_ACCEPTED`        | `bg-cyan-100 text-cyan-700`     | default       | No        |
| `VISIT_SCHEDULED`       | `bg-purple-100 text-purple-700` | default       | No        |
| `VISIT_COMPLETED`       | `bg-green-100 text-green-700`   | success       | No        |
| `NEGOTIATION_INITIATED` | `bg-orange-100 text-orange-700` | default       | No        |
| `CLOSED`                | `bg-gray-100 text-gray-500`     | secondary     | Yes       |
| `REJECTED`              | `bg-red-100 text-red-700`       | destructive   | Yes       |
| `EXPIRED`               | `bg-gray-100 text-gray-400`     | outline       | Yes       |

### Owner Service Request Status

| Value       | Color (Tailwind)                  | Badge Variant | Terminal? |
| ----------- | --------------------------------- | ------------- | --------- |
| `SUBMITTED` | `bg-blue-100 text-blue-700`       | default       | No        |
| `CONTACTED` | `bg-indigo-100 text-indigo-700`   | default       | No        |
| `ONBOARDED` | `bg-green-100 text-green-700`     | success       | No        |
| `ACTIVE`    | `bg-emerald-100 text-emerald-700` | success       | No        |
| `REJECTED`  | `bg-red-100 text-red-700`         | destructive   | Yes       |
| `DROPPED`   | `bg-gray-100 text-gray-500`       | secondary     | Yes       |

### Support Inquiry Status

| Value         | Color (Tailwind)              | Badge Variant | Terminal? |
| ------------- | ----------------------------- | ------------- | --------- |
| `OPEN`        | `bg-blue-100 text-blue-700`   | default       | No        |
| `IN_PROGRESS` | `bg-amber-100 text-amber-700` | warning       | No        |
| `RESOLVED`    | `bg-green-100 text-green-700` | success       | No        |
| `CLOSED`      | `bg-gray-100 text-gray-500`   | secondary     | Yes       |

### Persona Type

| Value    | Description                   |
| -------- | ----------------------------- |
| `GUARD`  | Society security guard        |
| `TENANT` | Prospective tenant            |
| `OWNER`  | Property owner                |
| `ADMIN`  | DemoRentals ops/admin team        |
| `OTHER`  | General public / unclassified |

### Contact Method

| Value      | Description                  |
| ---------- | ---------------------------- |
| `WHATSAPP` | WhatsApp deep link (`wa.me`) |
| `PHONE`    | Direct phone call (`tel:`)   |
| `EMAIL`    | Email (`mailto:`)            |
| `IN_APP`   | In-app message (V2)          |

## Notification Category (P35)

| Value                | Description                              |
| -------------------- | ---------------------------------------- |
| `LEAD_UPDATE`        | Lead status change, need-info request    |
| `VISIT_UPDATE`       | Visit scheduled, completed, cancelled    |
| `PAYOUT_UPDATE`      | Payout approved, disbursed, failed       |
| `INQUIRY_UPDATE`     | Inquiry status change, bounty posted     |
| `AGREEMENT_STATUS`   | Agreement and signing status updates     |
| `MOVE_IN_REMINDER`   | Move-in and checklist reminders          |
| `MAINTENANCE_UPDATE` | Maintenance ticket lifecycle updates     |
| `SYSTEM_ALERT`       | System announcements and priority alerts |

---

### Support Inquiry Enum Validators

**Persona Type** (on support_inquiries):

- `GUARD`, `TENANT`, `OWNER`, `OTHER`

**Preferred Contact Method** (on support_inquiries):

- `WHATSAPP`, `PHONE`, `EMAIL`, `IN_APP`

**Source Channel** (on support_inquiries):

- Optional string field tracking submission source (e.g., "contact_form", "whatsapp_click", "email")

### Lead Source

| Value              | Description                            |
| ------------------ | -------------------------------------- |
| `GUARD_SUBMISSION` | Guard-submitted vacancy lead           |
| `TENANT_INQUIRY`   | Tenant inquiry via listing             |
| `OWNER_REQUEST`    | Owner service request via contact form |
| `SUPPORT_FORM`     | General support inquiry                |
| `WHATSAPP_CLICK`   | WhatsApp button click (analytics)      |

### Visit Bounty Status

| Value       | Color (Tailwind)              | Description                            |
| ----------- | ----------------------------- | -------------------------------------- |
| `POSTED`    | `bg-amber-100 text-amber-700` | Bounty visible to guards in the area   |
| `CLAIMED`   | `bg-cyan-100 text-cyan-700`   | Guard has accepted/claimed the bounty  |
| `EXPIRED`   | `bg-gray-100 text-gray-400`   | No guard accepted within expiry window |
| `COMPLETED` | `bg-green-100 text-green-700` | Visit completed, bounty fulfilled      |

### Landmark Category (Commute Calculator)

| Value           | Description            |
| --------------- | ---------------------- |
| `TECH_HUB`      | IT park / tech campus  |
| `METRO_STATION` | Metro / rail station   |
| `HOSPITAL`      | Hospital / clinic      |
| `SCHOOL`        | School / university    |
| `MALL`          | Shopping mall / market |
| `OTHER`         | Other landmark         |

---

## Referral & Chat Enums

### Referral Type

| Value            | Description             |
| ---------------- | ----------------------- |
| `TENANT_FINDING` | Tenant finding referral |
| `OWNER_FINDING`  | Owner finding referral  |
| `GUARD`          | Guard-to-guard referral |

Note: `SIGN_UP` is NOT a referral type — it is a milestone type. Sign-up bonuses attach to `TENANT_FINDING` or `OWNER_FINDING` referrals. Type is determined by sign-up context (which page the user came from).

### Referral Status

| Value            | Description                                   |
| ---------------- | --------------------------------------------- |
| `PENDING`        | Referral recorded, no milestone triggered yet |
| `QUALIFIED`      | At least one milestone triggered              |
| `PARTIALLY_PAID` | Some milestones paid, others pending          |
| `FULLY_PAID`     | All milestones paid                           |
| `VOIDED`         | Referral voided by admin                      |

### Referral Milestone Type

| Value                 | Description                                       |
| --------------------- | ------------------------------------------------- |
| `SIGN_UP`             | Referred user signed up                           |
| `LISTING_PUBLISHED`   | Associated listing published                      |
| `DEAL_CLOSED`         | Associated deal closure confirmed                 |
| `FIRST_VERIFIED_LEAD` | Guard's first lead verified (guard referral only) |

### Referral Milestone Status

| Value       | Description                                |
| ----------- | ------------------------------------------ |
| `PENDING`   | Milestone not yet triggered                |
| `TRIGGERED` | Event occurred, awaiting admin approval    |
| `APPROVED`  | Admin approved, ready for payment          |
| `PAID`      | Money disbursed                            |
| `VOIDED`    | Voided (referral voided or deal cancelled) |

### Referral Config Scope Type

| Value      | Description                                     |
| ---------- | ----------------------------------------------- |
| `GLOBAL`   | Platform-wide default                           |
| `SOCIETY`  | Society-specific override                       |
| `BUILDING` | Building-specific override (highest precedence) |

### Chat Channel Status

| Value      | Label    | Description                            |
| ---------- | -------- | -------------------------------------- |
| `ACTIVE`   | Active   | Channel active, parties can message    |
| `ARCHIVED` | Archived | Channel archived by admin (can reopen) |

Source maps: `CHAT_CHANNEL_STATUS`, `CHAT_CHANNEL_STATUS_LABELS`.

### Chat Message Status

| Value        | Label      | Color (Tailwind)                | Description                                             |
| ------------ | ---------- | ------------------------------- | ------------------------------------------------------- |
| `SUBMITTED`  | Submitted  | `bg-blue-100 text-blue-700`     | User sent, awaiting batch assignment                    |
| `BATCHED`    | Batched    | `bg-indigo-100 text-indigo-700` | Message assigned to a processing batch                  |
| `PROCESSING` | Processing | `bg-amber-100 text-amber-700`   | AI masking pipeline in progress                         |
| `DELIVERED`  | Delivered  | `bg-green-100 text-green-700`   | Message successfully masked and delivered               |
| `FAILED`     | Failed     | `bg-red-100 text-red-700`       | Masking pipeline failed; admin can approve to DELIVERED |

Source maps: `CHAT_MESSAGE_STATUS`, `CHAT_MESSAGE_STATUS_LABELS`, `CHAT_MESSAGE_STATUS_COLORS`.

### Chat Message Batch Status

| Value        | Label      | Color (Tailwind)              | Description                                            |
| ------------ | ---------- | ----------------------------- | ------------------------------------------------------ |
| `COLLECTING` | Collecting | `bg-blue-100 text-blue-700`   | Batch window open, messages from same sender grouped   |
| `PROCESSING` | Processing | `bg-amber-100 text-amber-700` | AI masking pipeline in progress                        |
| `DELIVERED`  | Delivered  | `bg-green-100 text-green-700` | Batch masking complete and messages delivered          |
| `FAILED`     | Failed     | `bg-red-100 text-red-700`     | Batch masking failed; admin can reconcile to DELIVERED |

Source maps: `CHAT_BATCH_STATUS`, `CHAT_BATCH_STATUS_LABELS`, `CHAT_BATCH_STATUS_COLORS`.

### Chat Sender Role

| Value    | Label  | Description              |
| -------- | ------ | ------------------------ |
| `TENANT` | Tenant | Message from tenant      |
| `OWNER`  | Owner  | Message from owner       |
| `OPS`    | OPS    | Message from ops/admin   |
| `SYSTEM` | System | System-generated message |

Source maps: `CHAT_SENDER_ROLE`, `CHAT_SENDER_ROLE_LABELS`.

### Deal Checklist Status

| Value        | Label      | Color (Tailwind)                | Description                         |
| ------------ | ---------- | ------------------------------- | ----------------------------------- |
| `DRAFT`      | Draft      | `bg-gray-100 text-gray-600`     | AI generated, admin editing         |
| `SHARED`     | Shared     | `bg-blue-100 text-blue-700`     | Shared with both parties            |
| `IN_REVIEW`  | In Review  | `bg-yellow-100 text-yellow-700` | Parties reviewing items             |
| `APPROVED`   | Approved   | `bg-green-100 text-green-700`   | All items agreed, both signed       |
| `DISPUTED`   | Disputed   | `bg-red-100 text-red-700`       | One or more items disagreed         |
| `SUPERSEDED` | Superseded | `bg-gray-100 text-gray-500`     | Replaced by newer checklist version |

Source maps: `DEAL_CHECKLIST_STATUS`, `DEAL_CHECKLIST_STATUS_LABELS`, `DEAL_CHECKLIST_STATUS_COLORS`.

### Deal Checklist Item Approval

| Value       | Description               |
| ----------- | ------------------------- |
| `PENDING`   | Not yet reviewed          |
| `AGREED`    | Party agrees to this term |
| `DISAGREED` | Party disagrees           |
| `COMMENTED` | Party left a comment      |

### Deal Checklist Item Overall Status

| Value              | Description                                    |
| ------------------ | ---------------------------------------------- |
| `UNREVIEWED`       | Item has not been mutually resolved yet        |
| `RESOLVED`         | Both tenant and owner set approval to `AGREED` |
| `DISPUTED`         | At least one side set approval to `DISAGREED`  |
| `NEEDS_DISCUSSION` | Comment exists and no side has set `DISAGREED` |

### Deal Checklist Item Source

| Value          | Description                             |
| -------------- | --------------------------------------- |
| `AI_EXTRACTED` | Auto-extracted by AI from chat          |
| `ADMIN_ADDED`  | Manually added by admin                 |
| `PARTY_RAISED` | Raised by tenant or owner in discussion |

### Deal Term Type

| Value               | Description                     |
| ------------------- | ------------------------------- |
| `RENT_AMOUNT`       | Monthly rent amount             |
| `DEPOSIT`           | Security deposit amount         |
| `LEASE_DURATION`    | Lease duration/tenure           |
| `MOVE_IN_DATE`      | Move-in timeline                |
| `MAINTENANCE`       | Maintenance amount or payer     |
| `ESCALATION_CLAUSE` | Escalation terms                |
| `FURNISHING`        | Furnishing commitments          |
| `LOCK_IN_PERIOD`    | Lock-in duration and conditions |
| `NOTICE_PERIOD`     | Notice period obligations       |
| `BROKERAGE`         | Brokerage terms                 |
| `CUSTOM`            | Free-form custom term           |

### Owner Invite Status

| Value         | Label       | Color (Tailwind)                | Description                                  |
| ------------- | ----------- | ------------------------------- | -------------------------------------------- |
| `PENDING`     | Pending     | `bg-yellow-100 text-yellow-700` | Invite generated, awaiting owner consumption |
| `CONSUMED`    | Consumed    | `bg-green-100 text-green-700`   | Owner accepted and joined the chat channel   |
| `EXPIRED`     | Expired     | `bg-gray-100 text-gray-500`     | Invite expired without being consumed        |
| `REGENERATED` | Regenerated | `bg-blue-100 text-blue-700`     | Replaced by new invite (old one invalidated) |

Source maps: `OWNER_INVITE_STATUS`, `OWNER_INVITE_STATUS_LABELS`, `OWNER_INVITE_STATUS_COLORS`.

### Deal Checklist Signature Status (Derived)

No explicit enum is stored for signatures. Effective status is derived from signature rows:

| Derived Value      | Description                              |
| ------------------ | ---------------------------------------- |
| `UNSIGNED`         | No signatures for the checklist          |
| `PARTIALLY_SIGNED` | Exactly one signer (tenant or owner)     |
| `FULLY_SIGNED`     | Tenant and owner signatures both present |

Implementation note: code exports `DEAL_CHECKLIST_ITEM_APPROVAL` and `DEAL_CHECKLIST_ITEM_OVERALL_STATUS`; there is no literal `DEAL_CHECKLIST_ITEM_STATUS` or `DEAL_CHECKLIST_SIGNATURE_STATUS` constant.

---

---

## Negotiation Enums

Added by the Rent Negotiation feature (P26, third split from the original P23 scope). See [Rent Negotiation](features/19-rent-negotiation.md) and [State Machines](04-state-machines.md) for full state machine diagrams.

### Negotiation Status

| Value                       | Label                     | Color (Tailwind)                  | Terminal? |
| --------------------------- | ------------------------- | --------------------------------- | --------- |
| `INITIATED`                 | Initiated                 | `bg-slate-100 text-slate-700`     | No        |
| `ACTIVE`                    | Active                    | `bg-blue-100 text-blue-700`       | No        |
| `TERMS_PROPOSED`            | Terms Proposed            | `bg-indigo-100 text-indigo-700`   | No        |
| `COUNTER_PROPOSED`          | Counter Proposed          | `bg-purple-100 text-purple-700`   | No        |
| `TERMS_AGREED`              | Terms Agreed              | `bg-emerald-100 text-emerald-700` | No        |
| `TOKEN_COLLECTED`           | Token Collected           | `bg-cyan-100 text-cyan-700`       | No        |
| `DOCUMENTATION_IN_PROGRESS` | Documentation In Progress | `bg-amber-100 text-amber-700`     | No        |
| `READY_FOR_CLOSURE`         | Ready For Closure         | `bg-green-100 text-green-700`     | No        |
| `CLOSED`                    | Closed                    | `bg-green-200 text-green-800`     | Yes       |
| `FAILED`                    | Failed                    | `bg-red-100 text-red-700`         | Yes       |
| `STALLED`                   | Stalled                   | `bg-orange-100 text-orange-700`   | Yes       |
| `EXPIRED`                   | Expired                   | `bg-gray-100 text-gray-500`       | Yes       |

Source maps: `NEGOTIATION_STATUS`, `NEGOTIATION_STATUS_LABELS`, `NEGOTIATION_STATUS_COLORS`.

### Negotiation Room Type

| Value        | Description                              |
| ------------ | ---------------------------------------- |
| `OPS_TENANT` | Private ops <-> tenant room              |
| `OPS_OWNER`  | Private ops <-> owner room               |
| `COMBINED`   | Shared room for bridged consensus states |

### Negotiation Proposal Status

| Value         | Label       | Color (Tailwind)              | Description                           |
| ------------- | ----------- | ----------------------------- | ------------------------------------- |
| `DRAFT`       | Draft       | `bg-gray-100 text-gray-600`   | Ops creating proposal, not yet shared |
| `SHARED`      | Shared      | `bg-blue-100 text-blue-700`   | Shared with parties                   |
| `BOTH_AGREED` | Both Agreed | `bg-green-100 text-green-700` | Both parties agreed to this proposal  |
| `SUPERSEDED`  | Superseded  | `bg-gray-100 text-gray-500`   | Replaced by a newer proposal version  |

Source maps: `NEGOTIATION_PROPOSAL_STATUS`, `NEGOTIATION_PROPOSAL_STATUS_LABELS`, `NEGOTIATION_PROPOSAL_STATUS_COLORS`.

### Token Refund Policy

| Value                    | Description                                                                |
| ------------------------ | -------------------------------------------------------------------------- |
| `NON_REFUNDABLE`         | Token is non-refundable under any circumstances                            |
| `REFUNDABLE_WITHIN_DAYS` | Refundable if tenant cancels within X days (configurable: 3, 5, or 7 days) |
| `PARTIAL_REFUND`         | Partial refund of configurable percentage                                  |
| `CASE_BY_CASE`           | Management decides on a case-by-case basis                                 |

### Token Collection Method

| Value           | Description                 |
| --------------- | --------------------------- |
| `CASH`          | Collected as physical cash  |
| `UPI`           | Collected via UPI transfer  |
| `BANK_TRANSFER` | Collected via bank transfer |
| `CHEQUE`        | Collected via cheque        |

### Token Record Status

| Value       | Label     | Color (Tailwind)                | Description                                     |
| ----------- | --------- | ------------------------------- | ----------------------------------------------- |
| `PENDING`   | Pending   | `bg-amber-100 text-amber-700`   | Token agreed but not yet collected by DemoRentals   |
| `COLLECTED` | Collected | `bg-blue-100 text-blue-700`     | DemoRentals received the token                      |
| `REFUNDED`  | Refunded  | `bg-green-100 text-green-700`   | Token returned to tenant                        |
| `FORFEITED` | Forfeited | `bg-red-100 text-red-700`       | Tenant backed out; token kept per refund policy |
| `DISPUTED`  | Disputed  | `bg-orange-100 text-orange-700` | Refund dispute in progress                      |

Source maps: `TOKEN_RECORD_STATUS`, `TOKEN_RECORD_STATUS_LABELS`, `TOKEN_RECORD_STATUS_COLORS`.

### Negotiation Checklist Item Status

| Value              | Label            | Color (Tailwind)                  | Description                  |
| ------------------ | ---------------- | --------------------------------- | ---------------------------- |
| `PENDING`          | Pending          | `bg-gray-100 text-gray-600`       | Item pending action          |
| `IN_PROGRESS`      | In Progress      | `bg-blue-100 text-blue-700`       | Item currently being worked  |
| `COMPLETED`        | Completed        | `bg-green-100 text-green-700`     | Checklist item completed     |
| `OBTAINED`         | Obtained         | `bg-cyan-100 text-cyan-700`       | Required artifact obtained   |
| `VERIFIED`         | Verified         | `bg-emerald-100 text-emerald-700` | Artifact verified            |
| `STAMP_REGISTERED` | Stamp Registered | `bg-indigo-100 text-indigo-700`   | Stamp/registration completed |
| `DRAFT_READY`      | Draft Ready      | `bg-purple-100 text-purple-700`   | Draft document ready         |
| `WAIVED`           | Waived           | `bg-yellow-100 text-yellow-700`   | Item waived per policy       |

Source maps: `NEGOTIATION_CHECKLIST_ITEM_STATUS`, `NEGOTIATION_CHECKLIST_ITEM_STATUS_LABELS`, `NEGOTIATION_CHECKLIST_ITEM_STATUS_COLORS`.

### Maintenance Paid By

| Value    | Description                                    |
| -------- | ---------------------------------------------- |
| `TENANT` | Tenant pays maintenance charges                |
| `OWNER`  | Owner pays maintenance charges                 |
| `SPLIT`  | Maintenance charges split between both parties |

### Rent Escalation Type

| Value          | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `PERCENTAGE`   | Annual rent escalation as a percentage (e.g., 5% per year) |
| `FIXED_AMOUNT` | Annual rent escalation as a fixed paise amount             |
| `NONE`         | No rent escalation agreed                                  |

## Phase 26 Permissions

| Permission            | Description                                        |
| --------------------- | -------------------------------------------------- |
| `negotiations.view`   | View negotiations and 3-room message contexts      |
| `negotiations.manage` | Manage negotiation lifecycle, proposals, and token |

## Phase 26 System Config Keys

| Key                                | Default | Type   | Description                                           |
| ---------------------------------- | ------- | ------ | ----------------------------------------------------- |
| `negotiation_stale_days`           | `7`     | number | Days of inactivity before stale/escalation processing |
| `negotiation_max_rounds`           | `5`     | number | Max proposal rounds before escalation                 |
| `negotiation_token_agreement_days` | `3`     | number | Days for post-token agreement completion window       |

---

## Named Floor Conventions

| Label             | Meaning                |
| ----------------- | ---------------------- |
| `G`               | Ground floor           |
| `B1`, `B2`        | Basement 1, Basement 2 |
| `LG`              | Lower Ground           |
| `M`               | Mezzanine              |
| `P`               | Podium                 |
| `1`, `2`, ... `N` | Numbered floors        |

## Phase 32 Incentive v3 Enums

### Incentive Persona

| Value     |
| --------- |
| `GUARD`   |
| `OPS`     |
| `SALES`   |
| `RM`      |
| `LIAISON` |
| `ALL`     |

### Contribution Stage

| Value          |
| -------------- |
| `DISCOVERY`    |
| `VERIFICATION` |
| `CLOSURE`      |
| `SUPPORT`      |

### Attribution Algorithm

| Value                    |
| ------------------------ |
| `STAGE_WEIGHTED_QUALITY` |
| `EQUAL_SPLIT`            |
| `MANUAL_OVERRIDE`        |

### Contribution Source Entity

| Value       |
| ----------- |
| `LEAD`      |
| `VISIT`     |
| `CLOSURE`   |
| `AUDIT_LOG` |
| `MANUAL`    |

### Config Version Status

| Value      |
| ---------- |
| `DRAFT`    |
| `ACTIVE`   |
| `ARCHIVED` |

### Attribution Status

| Value         |
| ------------- |
| `PROVISIONAL` |
| `FINAL`       |
| `DISPUTED`    |
| `RESOLVED`    |

### Disbursement Status

| Value       |
| ----------- |
| `PENDING`   |
| `APPROVED`  |
| `DISBURSED` |
| `FAILED`    |
| `VOIDED`    |

### Disbursement Source Type

| Value               |
| ------------------- |
| `ATTRIBUTION_SPLIT` |
| `QUEST_REWARD`      |
| `TEAM_POOL`         |
| `V2_MIGRATION`      |

### Modifier Reward Mode

| Value        |
| ------------ |
| `BPS`        |
| `FLAT_PAISE` |

### Modifier Link Mode

| Value        |
| ------------ |
| `INDIVIDUAL` |
| `AND_GROUP`  |
| `OR_GROUP`   |

### Modifier Rule Type

| Value            |
| ---------------- |
| `threshold_step` |
| `linear_band`    |
| `penalty_step`   |

### Commission Metric Source

| Value                      |
| -------------------------- |
| `avg_doc_processing_hours` |
| `on_time_visit_rate`       |
| `avg_checklist_score`      |
| `response_speed_hours`     |
| `completion_rate`          |
| `penalty_count`            |
| `custom`                   |

### Commission Eval Status

| Value    |
| -------- |
| `DRAFT`  |
| `FINAL`  |
| `VOIDED` |

### Commission Bounds (`COMMISSION_BOUNDS`)

| Key                | Value  |
| ------------------ | ------ |
| `DEFAULT_BASE_BPS` | `1500` |
| `DEFAULT_MIN_BPS`  | `1500` |
| `DEFAULT_MAX_BPS`  | `2200` |

### Attribution Stage Weights (`ATTRIBUTION_STAGE_WEIGHTS`)

| Stage          | Weight |
| -------------- | ------ |
| `DISCOVERY`    | `25`   |
| `VERIFICATION` | `35`   |
| `CLOSURE`      | `25`   |
| `SUPPORT`      | `15`   |

### Weekly Tier

| Value      | Threshold (`WEEKLY_TIER_THRESHOLDS`) |
| ---------- | ------------------------------------ |
| `BRONZE`   | `0`                                  |
| `SILVER`   | `200`                                |
| `GOLD`     | `500`                                |
| `PLATINUM` | `1000`                               |

### Quest Reward Type

| Value   |
| ------- |
| `XP`    |
| `PAISE` |
| `PERK`  |

### Quest Scope

| Value        |
| ------------ |
| `INDIVIDUAL` |
| `TEAM`       |

### XP Awards (`XP_AWARDS`)

| Key                              | XP    |
| -------------------------------- | ----- |
| `LEAD_VERIFIED`                  | `50`  |
| `LEAD_VERIFIED_HIGH_QUALITY`     | `50`  |
| `LEAD_VERIFIED_LOW_QUALITY`      | `25`  |
| `VISIT_COMPLETED`                | `75`  |
| `VISIT_COMPLETED_HIGH_CHECKLIST` | `100` |
| `CLOSURE_COMPLETED`              | `200` |
| `DOCUMENT_ON_TIME`               | `30`  |
| `DOCUMENT_LATE`                  | `15`  |
| `DAILY_CHECKLIST_COMPLETE`       | `50`  |
| `PERFECT_WEEK`                   | `300` |

### Streak Milestones (`STREAK_MILESTONES`)

| Days  | XP     | Badge                |
| ----- | ------ | -------------------- |
| `7`   | `100`  | `WEEK_WARRIOR`       |
| `14`  | `250`  | `null`               |
| `30`  | `500`  | `MONTHLY_CHAMPION`   |
| `60`  | `1000` | `DEDICATION`         |
| `100` | `2000` | `CENTURY`            |
| `365` | `0`    | `YEAR_OF_EXCELLENCE` |

### Badge Code V3 (`BADGE_CODE_V3`)

| Value                |
| -------------------- |
| `FIRST_CLOSURE`      |
| `SPEED_DEMON`        |
| `DOCUMENT_MASTER`    |
| `PERFECT_WEEK`       |
| `DIAMOND_ACHIEVER`   |
| `CENTURY_STREAK`     |
| `QUALITY_KING`       |
| `TEAM_PLAYER`        |
| `WEEK_WARRIOR`       |
| `MONTHLY_CHAMPION`   |
| `DEDICATION`         |
| `YEAR_OF_EXCELLENCE` |
| `EXPERIENCED`        |
| `VETERAN`            |
| `ELITE`              |
| `LEGEND`             |

## Phase 32 Permissions

| Permission             | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `commission.configure` | Configure commission engine defaults and modifier templates |
| `commission.view`      | View commission evaluations and simulation outputs          |
| `attribution.compute`  | Trigger attribution computations                            |
| `attribution.dispute`  | Raise/manage attribution disputes                           |
| `attribution.override` | Apply admin overrides to attribution results                |
| `attribution.view`     | View attribution records and split previews                 |
| `gamification.manage`  | Manage quests, XP rules, and badge grant workflows          |
| `gamification.view`    | View gamification profiles, levels, streaks, and quests     |
| `shadow_mode.view`     | View shadow-mode delta reports                              |
| `shadow_mode.manage`   | Manage shadow-mode rollout/decommission controls            |
| `disbursement.approve` | Approve commission disbursements                            |
| `disbursement.void`    | Void failed/incorrect commission disbursements              |

## Phase 32 System Config Keys

| Key                                            | Default                                                                                                       | Type    | Description                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------- |
| `incentive_v3_active_config_version`           | `v3.0.0`                                                                                                      | string  | Active v3 config version                          |
| `incentive_v3_feature_flags`                   | `{"shadow_mode":true,"split_preview_enabled":true,"disbursement_enabled":false,"gamification_enabled":false}` | string  | JSON feature-flag bundle for v3 capabilities      |
| `incentive_v3_rollout_policy`                  | `{"mode":"OFF","enabled_personas":[],"notes":"v2 remains payout source of truth"}`                            | string  | JSON rollout policy (mode + enabled personas)     |
| `incentive_v3_shadow_mode_enabled`             | `true`                                                                                                        | boolean | Global shadow mode toggle                         |
| `incentive_v3_decommission_variance_threshold` | `5`                                                                                                           | number  | Max acceptable delta % for v2 decommission gating |

## Phase 33: Trust & Verification Display

### Trust Badge Type (`TRUST_BADGE_TYPE`)

Type alias: `TrustBadgeType`

| Value                  | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `OWNER_VERIFIED`       | Listing owner identity is verified                 |
| `PHYSICALLY_INSPECTED` | Listing has on-ground inspection evidence          |
| `FRESH_LISTING`        | Listing passes freshness threshold                 |
| `REAL_PHOTOS`          | Listing has sufficient real, non-placeholder media |
| `VISITS_COMPLETED`     | Listing has completed visit history                |
| `CLOSURE_HISTORY`      | Listing/owner has historical deal closure signal   |

### Freshness State (`FRESHNESS_STATE`)

Type alias: `FreshnessState`

| Value   | Description                  |
| ------- | ---------------------------- |
| `FRESH` | Recently updated listing     |
| `AGING` | Approaching stale threshold  |
| `STALE` | Freshness threshold exceeded |

### Freshness State Colors (`FRESHNESS_STATE_COLORS`)

| Value   | Color (Tailwind)                  |
| ------- | --------------------------------- |
| `FRESH` | `bg-emerald-100 text-emerald-700` |
| `AGING` | `bg-amber-100 text-amber-700`     |
| `STALE` | `bg-red-100 text-red-700`         |

### Trust Badge Display Config (`TRUST_BADGE_CONFIG`)

| Badge Type             | Label          | Color (Tailwind)                 | Icon Name        | Priority |
| ---------------------- | -------------- | -------------------------------- | ---------------- | -------- |
| `OWNER_VERIFIED`       | Owner Verified | `bg-emerald-50 text-emerald-700` | `ShieldCheck`    | `1`      |
| `PHYSICALLY_INSPECTED` | Inspected      | `bg-blue-50 text-blue-700`       | `ClipboardCheck` | `2`      |
| `FRESH_LISTING`        | Fresh          | `bg-amber-50 text-amber-700`     | `Clock`          | `3`      |
| `REAL_PHOTOS`          | Real Photos    | `bg-purple-50 text-purple-700`   | `Camera`         | `4`      |
| `VISITS_COMPLETED`     | Visited        | `bg-indigo-50 text-indigo-700`   | `Users`          | `5`      |
| `CLOSURE_HISTORY`      | Deal History   | `bg-orange-50 text-orange-700`   | `Trophy`         | `6`      |

## Phase 33 Permissions

| Permission            | Description                                               |
| --------------------- | --------------------------------------------------------- |
| `trust_badges.view`   | View computed trust badges and freshness state            |
| `trust_badges.manage` | Reserved for manual/admin-triggered trust badge recompute |

## Phase 33 System Config Keys

| Key                                    | Default | Type   | Description                                           |
| -------------------------------------- | ------- | ------ | ----------------------------------------------------- |
| `trust_badge_freshness_threshold_days` | `30`    | number | Days before a listing transitions from fresh to stale |
| `trust_badge_min_photos`               | `5`     | number | Minimum photo count required for `REAL_PHOTOS` badge  |

## Phase 34: Transaction Completion Rails

### Transaction Status (`TRANSACTION_STATUS`)

Type alias: `TransactionStatus`  
Label map: `TRANSACTION_STATUS_LABELS`  
Color map: `TRANSACTION_STATUS_COLORS`

| Value               | Label             | Color (Tailwind)                  | Terminal? |
| ------------------- | ----------------- | --------------------------------- | --------- |
| `INITIATED`         | Initiated         | `bg-slate-100 text-slate-700`     | No        |
| `KYC_PENDING`       | KYC Pending       | `bg-amber-100 text-amber-700`     | No        |
| `KYC_VERIFIED`      | KYC Verified      | `bg-emerald-100 text-emerald-700` | No        |
| `KYC_REJECTED`      | KYC Rejected      | `bg-red-100 text-red-700`         | No        |
| `AGREEMENT_PENDING` | Agreement Pending | `bg-indigo-100 text-indigo-700`   | No        |
| `AGREEMENT_SENT`    | Agreement Sent    | `bg-blue-100 text-blue-700`       | No        |
| `AGREEMENT_SIGNED`  | Agreement Signed  | `bg-green-100 text-green-700`     | No        |
| `TOKEN_PENDING`     | Token Pending     | `bg-orange-100 text-orange-700`   | No        |
| `TOKEN_RECEIVED`    | Token Received    | `bg-orange-200 text-orange-800`   | No        |
| `DEPOSIT_PENDING`   | Deposit Pending   | `bg-cyan-100 text-cyan-700`       | No        |
| `DEPOSIT_RECEIVED`  | Deposit Received  | `bg-cyan-200 text-cyan-800`       | No        |
| `MOVE_IN_SCHEDULED` | Move-in Scheduled | `bg-purple-100 text-purple-700`   | No        |
| `COMPLETED`         | Completed         | `bg-green-200 text-green-800`     | Yes       |
| `CANCELLED`         | Cancelled         | `bg-gray-100 text-gray-500`       | Yes       |

### KYC Packet Status (`KYC_PACKET_STATUS`)

Type alias: `KycPacketStatus`  
Label map: `KYC_PACKET_STATUS_LABELS`

| Value            | Label          |
| ---------------- | -------------- |
| `PENDING`        | Pending        |
| `IN_PROGRESS`    | In Progress    |
| `PROVIDER_ERROR` | Provider Error |
| `NEEDS_REVIEW`   | Needs Review   |
| `VERIFIED`       | Verified       |
| `REJECTED`       | Rejected       |

### Agreement Status (`AGREEMENT_STATUS`)

Type alias: `AgreementStatus`  
Label map: `AGREEMENT_STATUS_LABELS`

| Value              | Label            |
| ------------------ | ---------------- |
| `DRAFT`            | Draft            |
| `SENT`             | Sent             |
| `PARTIALLY_SIGNED` | Partially Signed |
| `SIGNED`           | Signed           |
| `EXPIRED`          | Expired          |
| `CANCELLED`        | Cancelled        |

### Token Booking Status (`TOKEN_BOOKING_STATUS`)

Type alias: `TokenBookingStatus`  
Label map: `TOKEN_BOOKING_STATUS_LABELS`

| Value       | Label     |
| ----------- | --------- |
| `PENDING`   | Pending   |
| `RECORDED`  | Recorded  |
| `CONFIRMED` | Confirmed |
| `DISPUTED`  | Disputed  |
| `CANCELLED` | Cancelled |

### Deposit Record Status (`DEPOSIT_RECORD_STATUS`)

Type alias: `DepositRecordStatus`  
Label map: `DEPOSIT_RECORD_STATUS_LABELS`

| Value       | Label     |
| ----------- | --------- |
| `PENDING`   | Pending   |
| `RECORDED`  | Recorded  |
| `CONFIRMED` | Confirmed |
| `DISPUTED`  | Disputed  |
| `CANCELLED` | Cancelled |

### Police Verification Status (`POLICE_VERIFICATION_STATUS`)

Type alias: `PoliceVerificationStatus`  
Label map: `POLICE_VERIFICATION_STATUS_LABELS`

| Value            | Label          |
| ---------------- | -------------- |
| `NOT_STARTED`    | Not Started    |
| `FORM_GENERATED` | Form Generated |
| `SUBMITTED`      | Submitted      |
| `VERIFIED`       | Verified       |
| `REJECTED`       | Rejected       |

### Transaction Transitions (`VALID_TRANSACTION_TRANSITIONS`)

| From                | Allowed To                                           |
| ------------------- | ---------------------------------------------------- |
| `INITIATED`         | `KYC_PENDING`, `CANCELLED`                           |
| `KYC_PENDING`       | `KYC_VERIFIED`, `KYC_REJECTED`, `CANCELLED`          |
| `KYC_VERIFIED`      | `AGREEMENT_PENDING`, `CANCELLED`                     |
| `KYC_REJECTED`      | `KYC_PENDING`, `CANCELLED`                           |
| `AGREEMENT_PENDING` | `AGREEMENT_SENT`, `CANCELLED`                        |
| `AGREEMENT_SENT`    | `AGREEMENT_SIGNED`, `AGREEMENT_PENDING`, `CANCELLED` |
| `AGREEMENT_SIGNED`  | `TOKEN_PENDING`, `CANCELLED`                         |
| `TOKEN_PENDING`     | `TOKEN_RECEIVED`, `CANCELLED`                        |
| `TOKEN_RECEIVED`    | `DEPOSIT_PENDING`, `CANCELLED`                       |
| `DEPOSIT_PENDING`   | `DEPOSIT_RECEIVED`, `CANCELLED`                      |
| `DEPOSIT_RECEIVED`  | `MOVE_IN_SCHEDULED`, `CANCELLED`                     |
| `MOVE_IN_SCHEDULED` | `COMPLETED`, `CANCELLED`                             |
| `COMPLETED`         | _(none; terminal)_                                   |
| `CANCELLED`         | _(none; terminal)_                                   |

### KYC Transitions (`VALID_KYC_TRANSITIONS`)

| From             | Allowed To                                               |
| ---------------- | -------------------------------------------------------- |
| `PENDING`        | `IN_PROGRESS`                                            |
| `IN_PROGRESS`    | `NEEDS_REVIEW`, `VERIFIED`, `REJECTED`, `PROVIDER_ERROR` |
| `PROVIDER_ERROR` | `IN_PROGRESS`                                            |
| `NEEDS_REVIEW`   | `VERIFIED`, `REJECTED`                                   |
| `VERIFIED`       | _(none; terminal)_                                       |
| `REJECTED`       | `PENDING`                                                |

### Agreement Transitions (`VALID_AGREEMENT_TRANSITIONS`)

| From               | Allowed To                                           |
| ------------------ | ---------------------------------------------------- |
| `DRAFT`            | `SENT`, `CANCELLED`                                  |
| `SENT`             | `PARTIALLY_SIGNED`, `SIGNED`, `EXPIRED`, `CANCELLED` |
| `PARTIALLY_SIGNED` | `SIGNED`, `EXPIRED`, `CANCELLED`                     |
| `SIGNED`           | _(none; terminal)_                                   |
| `EXPIRED`          | `DRAFT`                                              |
| `CANCELLED`        | _(none; terminal)_                                   |

### Token Booking Transitions (`VALID_TOKEN_BOOKING_TRANSITIONS`)

| From        | Allowed To               |
| ----------- | ------------------------ |
| `PENDING`   | `RECORDED`, `CANCELLED`  |
| `RECORDED`  | `CONFIRMED`, `DISPUTED`  |
| `CONFIRMED` | _(none; terminal)_       |
| `DISPUTED`  | `CONFIRMED`, `CANCELLED` |
| `CANCELLED` | _(none; terminal)_       |

### Deposit Record Transitions (`VALID_DEPOSIT_RECORD_TRANSITIONS`)

| From        | Allowed To               |
| ----------- | ------------------------ |
| `PENDING`   | `RECORDED`, `CANCELLED`  |
| `RECORDED`  | `CONFIRMED`, `DISPUTED`  |
| `CONFIRMED` | _(none; terminal)_       |
| `DISPUTED`  | `CONFIRMED`, `CANCELLED` |
| `CANCELLED` | _(none; terminal)_       |

## Phase 34 Permissions

| Permission            | Description                                      |
| --------------------- | ------------------------------------------------ |
| `transactions.view`   | View transaction timelines and rail stage states |
| `transactions.manage` | Manage transaction lifecycle transitions         |
| `kyc.verify`          | Verify/reject KYC packets                        |
| `agreements.generate` | Generate/regenerate rental agreements            |
| `agreements.sign`     | Record/complete agreement signing flow           |

## Phase 34 System Config Keys

| Key                            | Default | Type   | Description                                               |
| ------------------------------ | ------- | ------ | --------------------------------------------------------- |
| `transaction_auto_cancel_days` | `14`    | number | Auto-cancel threshold for stale non-terminal transactions |
| `kyc_provider_timeout_ms`      | `45000` | number | Timeout for KYC provider calls in milliseconds            |
| `esign_deadline_days`          | `5`     | number | eSign deadline before agreement expiry handling           |

## Phase 34 Audit Action Validators

The following literals are registered in `convex/schema.ts` for `audit_logs.action` validation:

| Action                       | Table / Trigger              |
| ---------------------------- | ---------------------------- |
| `RENTAL_TRANSACTIONS_INSERT` | `rental_transactions` insert |
| `RENTAL_TRANSACTIONS_UPDATE` | `rental_transactions` update |
| `RENTAL_AGREEMENTS_INSERT`   | `rental_agreements` insert   |
| `RENTAL_AGREEMENTS_UPDATE`   | `rental_agreements` update   |
| `KYC_PACKETS_INSERT`         | `kyc_packets` insert         |
| `KYC_PACKETS_UPDATE`         | `kyc_packets` update         |
| `TOKEN_BOOKINGS_INSERT`      | `token_bookings` insert      |
| `TOKEN_BOOKINGS_UPDATE`      | `token_bookings` update      |
| `DEPOSIT_RECORDS_INSERT`     | `deposit_records` insert     |
| `DEPOSIT_RECORDS_UPDATE`     | `deposit_records` update     |
| `HANDOVER_CHECKLISTS_INSERT` | `handover_checklists` insert |
| `HANDOVER_CHECKLISTS_UPDATE` | `handover_checklists` update |

## Phase 35: Notification Infrastructure

### Notification Channel (`NOTIFICATION_CHANNEL`)

Type alias: `NotificationChannel`

| Value      | Description               |
| ---------- | ------------------------- |
| `IN_APP`   | In-app feed notification  |
| `PUSH`     | Push notification channel |
| `WHATSAPP` | WhatsApp channel          |
| `SMS`      | SMS channel               |
| `EMAIL`    | Email channel             |

### Notification Category (`NOTIFICATION_CATEGORY`)

Type alias: `NotificationCategory`

| Value                | Description                          |
| -------------------- | ------------------------------------ |
| `LEAD_UPDATE`        | Lead lifecycle updates               |
| `VISIT_UPDATE`       | Visit lifecycle updates              |
| `PAYOUT_UPDATE`      | Payout lifecycle updates             |
| `INQUIRY_UPDATE`     | Tenant inquiry updates               |
| `AGREEMENT_STATUS`   | Agreement and signing status updates |
| `MOVE_IN_REMINDER`   | Move-in reminders                    |
| `MAINTENANCE_UPDATE` | Maintenance lifecycle updates        |
| `SYSTEM_ALERT`       | System alerts/announcements          |

### Notification Severity (`NOTIFICATION_SEVERITY`)

Type alias: `NotificationSeverity`

| Value       | Description       |
| ----------- | ----------------- |
| `NORMAL`    | Standard priority |
| `IMPORTANT` | Elevated priority |
| `URGENT`    | Urgent priority   |

### Notification Event Status (`NOTIFICATION_EVENT_STATUS`)

Type alias: `NotificationEventStatus`

| Value         | Description                                   |
| ------------- | --------------------------------------------- |
| `PENDING`     | Event created and queued                      |
| `PROCESSING`  | Delivery pipeline running                     |
| `DELIVERED`   | Successfully delivered                        |
| `FAILED`      | Delivery failed                               |
| `DEAD_LETTER` | Permanently failed, moved to dead-letter path |
| `SUPPRESSED`  | Suppressed by dedup/preferences/rules         |

### Persona Channel Priority (`PERSONA_CHANNEL_PRIORITY`)

| Persona  | Priority Order                            |
| -------- | ----------------------------------------- |
| `GUARD`  | `WHATSAPP` -> `PUSH` -> `SMS` -> `IN_APP` |
| `ADMIN`  | `IN_APP`                                  |
| `OPS`    | `IN_APP`                                  |
| `TENANT` | `PUSH` -> `IN_APP` -> `WHATSAPP` -> `SMS` |
| `OWNER`  | `WHATSAPP` -> `PUSH` -> `SMS` -> `IN_APP` |

### Notification Channel Throttle Caps (`NOTIFICATION_CHANNEL_THROTTLE_CAPS`)

| Channel    | Max Events / Window |
| ---------- | ------------------- |
| `PUSH`     | `5`                 |
| `WHATSAPP` | `3`                 |
| `SMS`      | `1`                 |
| `EMAIL`    | `3`                 |

`IN_APP` is intentionally excluded from this cap map.

## Phase 35 Permissions

| Permission                      | Description                                          |
| ------------------------------- | ---------------------------------------------------- |
| `notifications.view`            | View notification events and monitor status          |
| `notifications.manage`          | Manage notification operations and delivery controls |
| `notification_templates.manage` | Manage notification templates                        |

## Phase 35 System Config Keys

| Key                              | Default  | Type   | Description                                |
| -------------------------------- | -------- | ------ | ------------------------------------------ |
| `notification_quiet_hours_start` | `22:00`  | string | Quiet hours start (`HH:MM`)                |
| `notification_quiet_hours_end`   | `07:00`  | string | Quiet hours end (`HH:MM`)                  |
| `notification_dedup_window_ms`   | `300000` | number | Event deduplication window in milliseconds |
| `notification_max_retries`       | `3`      | number | Max retry attempts per event               |
| `notification_retry_base_ms`     | `2000`   | number | Base backoff duration in milliseconds      |

## Phase 37 Resident Lifecycle Enums

### Resident Profile Status

| Value                | Description                                    |
| -------------------- | ---------------------------------------------- |
| `PENDING_ACTIVATION` | Closure confirmed, awaiting activation trigger |
| `ACTIVE`             | Resident actively living in property           |
| `RENEWAL_PENDING`    | Lease renewal initiated, awaiting response     |
| `MOVE_OUT_REQUESTED` | Move-out request submitted                     |
| `MOVED_OUT`          | Tenant has vacated                             |
| `ARCHIVED`           | Record archived post-settlement                |

### Rent Record Status

| Value            | Description                      |
| ---------------- | -------------------------------- |
| `UPCOMING`       | Future period, not yet due       |
| `DUE`            | Current period, payment expected |
| `PAID`           | Fully paid                       |
| `OVERDUE`        | Past due date, unpaid            |
| `PARTIALLY_PAID` | Partial payment received         |
| `WAIVED`         | Rent waived by admin             |

### Rent Payment Mode

| Value           |
| --------------- |
| `UPI`           |
| `BANK_TRANSFER` |
| `CASH`          |
| `CHEQUE`        |
| `AUTO_DEBIT`    |

### Maintenance Ticket Category

| Value          |
| -------------- |
| `PLUMBING`     |
| `ELECTRICAL`   |
| `CARPENTRY`    |
| `PAINTING`     |
| `APPLIANCE`    |
| `PEST_CONTROL` |
| `COMMON_AREA`  |
| `OTHER`        |

### Maintenance Ticket Severity

| Value    | SLA (hours) |
| -------- | ----------- |
| `LOW`    | 72          |
| `MEDIUM` | 48          |
| `HIGH`   | 24          |
| `URGENT` | 4           |

### Maintenance Ticket Status

| Value         |
| ------------- |
| `OPEN`        |
| `ASSIGNED`    |
| `IN_PROGRESS` |
| `RESOLVED`    |
| `CLOSED`      |
| `CANCELLED`   |

### Lease Renewal Status

| Value                | Description                                      |
| -------------------- | ------------------------------------------------ |
| `INITIATED`          | Renewal process started (by system/owner/tenant) |
| `OWNER_RESPONDED`    | Owner provided response                          |
| `TENANT_RESPONDED`   | Tenant provided response                         |
| `NEGOTIATING`        | Counter-offers in progress                       |
| `AGREED`             | Both parties agreed on terms                     |
| `RENEWED`            | New lease terms applied                          |
| `MOVE_OUT_REQUESTED` | Tenant/owner requested move-out                  |
| `MOVE_OUT_CONFIRMED` | Move-out confirmed and scheduled                 |
| `EXPIRED`            | Renewal window expired without action            |

### Owner Renewal Response

| Value              |
| ------------------ |
| `RENEW_SAME_TERMS` |
| `RENEW_NEW_TERMS`  |
| `TERMINATE`        |

### Tenant Renewal Response

| Value      |
| ---------- |
| `ACCEPT`   |
| `COUNTER`  |
| `MOVE_OUT` |

### Move-Out Settlement Status

| Value      |
| ---------- |
| `PENDING`  |
| `APPROVED` |
| `DISPUTED` |
| `SETTLED`  |

## Phase 37 Permissions

| Permission                | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `residents.view`          | View resident profiles and rent records             |
| `residents.manage`        | Activate/deactivate residents, manage assignments   |
| `rent_records.manage`     | Record rent payments, generate receipts, waive rent |
| `maintenance.create`      | Create maintenance tickets (tenant-scoped)          |
| `maintenance.manage`      | Assign, update, resolve maintenance tickets         |
| `maintenance.view_all`    | View all maintenance tickets across properties      |
| `lease_renewals.initiate` | Start renewal process                               |
| `lease_renewals.manage`   | Manage renewal negotiations, approve settlements    |
| `move_out.manage`         | Process move-out requests and deposit settlements   |

## Phase 37 System Config Keys

| Key                            | Default | Type   | Description                               |
| ------------------------------ | ------- | ------ | ----------------------------------------- |
| `rent_reminder_days_before`    | `3`     | number | Days before due date to send reminder     |
| `rent_overdue_grace_days`      | `1`     | number | Days after due date before overdue status |
| `maintenance_sla_low_hours`    | `72`    | number | SLA hours for LOW severity tickets        |
| `maintenance_sla_medium_hours` | `48`    | number | SLA hours for MEDIUM severity tickets     |
| `maintenance_sla_high_hours`   | `24`    | number | SLA hours for HIGH severity tickets       |
| `maintenance_sla_urgent_hours` | `4`     | number | SLA hours for URGENT severity tickets     |
| `lease_renewal_notice_days`    | `60`    | number | Days before lease end to initiate renewal |

---

## Phase 39 Constants (Tenant Trust and Reviews)

Reference: [Tenant Trust Score & Reviews](features/31-tenant-trust-score-reviews.md)

### TRUST_BAND

| Value      |
| ---------- |
| `NEW`      |
| `BUILDING` |
| `TRUSTED`  |
| `PREMIUM`  |

### TRUST_COMPONENT

| Value               |
| ------------------- |
| `IDENTITY`          |
| `EMPLOYMENT`        |
| `RENTAL_HISTORY`    |
| `PLATFORM_BEHAVIOR` |

### REVIEW_TYPE

| Value                          |
| ------------------------------ |
| `TENANT_LISTING_ACCURACY`      |
| `TENANT_GUARD_PROFESSIONALISM` |
| `OWNER_TENANT_RELIABILITY`     |
| `OWNER_PLATFORM_SERVICE`       |

### REVIEW_STATUS

| Value             |
| ----------------- |
| `PENDING_COOLING` |
| `PUBLISHED`       |
| `FLAGGED`         |
| `HIDDEN`          |
| `REMOVED`         |

### REVIEW_TARGET_TYPE

| Value      |
| ---------- |
| `LISTING`  |
| `GUARD`    |
| `TENANT`   |
| `PLATFORM` |

### MODERATION_ACTION

| Value          |
| -------------- |
| `HIDE`         |
| `UNHIDE`       |
| `MARK_ABUSIVE` |
| `RESOLVE_FLAG` |

### REVIEW_MODERATION_REASON_CODE

| Value                   |
| ----------------------- |
| `SPAM`                  |
| `ABUSIVE_LANGUAGE`      |
| `HARASSMENT`            |
| `PII_EXPOSED`           |
| `OFF_TOPIC`             |
| `DUPLICATE_CONTENT`     |
| `FALSE_CLAIM`           |
| `MANUAL_QUALITY_REVIEW` |

### INTERACTION_TYPE

| Value         |
| ------------- |
| `VISIT`       |
| `TENANCY`     |
| `TRANSACTION` |

### Phase 39 Permissions

| Permission                                 | Description                                     |
| ------------------------------------------ | ----------------------------------------------- |
| `tenant_trust.view`                        | View own trust score and components             |
| `tenant_trust.view_any`                    | View any tenant trust score (backoffice scoped) |
| `tenant_trust.recalculate`                 | Trigger manual trust recomputation              |
| `tenant_trust.export_eligibility_snapshot` | Export immutable trust snapshot for issuance    |
| `reviews.submit`                           | Submit interaction-gated reviews                |
| `reviews.view`                             | View in-scope reviews                           |
| `reviews.view_any`                         | View any review for moderation/analytics        |
| `reviews.moderate`                         | Moderate review status/visibility               |
| `reviews.respond`                          | Add/edit review response (admin moderation)     |
| `reviews.respond_owner`                    | Owner-scoped response capability                |

`reviews.respond` is admin-only. `reviews.respond_owner` is owner-only. Tenants cannot respond.

### Phase 39 System Config Keys

| Key                             | Default     | Type    | Description                                                                      |
| ------------------------------- | ----------- | ------- | -------------------------------------------------------------------------------- |
| `trust_baseline_score`          | `20`        | number  | Cold-start baseline score                                                        |
| `trust_decay_rate_per_month`    | `2`         | number  | Monthly decay after inactivity window                                            |
| `trust_decay_start_days`        | `90`        | number  | Inactivity days before decay starts                                              |
| `trust_decay_floor`             | `15`        | number  | Minimum score after decay                                                        |
| `trust_referral_boost`          | `5`         | number  | One-time referral boost points                                                   |
| `review_submission_rate_limit`  | `5`         | number  | Max review submissions per user per 24h                                          |
| `review_cooling_period_ms`      | `172800000` | number  | Cooling period before publish (48h)                                              |
| `review_submission_window_days` | `30`        | number  | Max days after interaction for review submission                                 |
| `review_anomaly_z_threshold`    | `2.0`       | number  | Z-score threshold for anomaly flagging                                           |
| `review_anomaly_min_sample`     | `5`         | number  | Min sample for anomaly detection                                                 |
| `trust_ai_signal_enabled`       | `false`     | boolean | Gates future P40 AI signal integration into `platform_behavior`; V1 always false |

---

## Phase 40 Constants (AI Intelligence Spine)

Reference: [AI Intelligence Spine](features/32-ai-intelligence-spine.md)

### LEAD_SCORE_BAND

| Value  |
| ------ |
| `HOT`  |
| `WARM` |
| `COOL` |
| `COLD` |

### FRAUD_RISK_LEVEL

| Value   |
| ------- |
| `WATCH` |
| `ALERT` |
| `BLOCK` |

Absence of a fraud signal record means no risk detected (clean). `CLEAR` is NOT a valid enum value.

### FRAUD_ADMIN_FLAG_STATE

| Value          |
| -------------- |
| `NONE`         |
| `ALERTED`      |
| `AUTO_FLAGGED` |
| `UNDER_APPEAL` |
| `RESOLVED`     |

### AI_ACTION_TYPE

| Value           |
| --------------- |
| `RENT_ESTIMATE` |
| `PHOTO_QUALITY` |
| `LEAD_SCORE`    |
| `FRAUD_CHECK`   |

### PHOTO_QUALITY_STATUS

| Value             |
| ----------------- |
| `ACCEPTED`        |
| `PENDING_REVIEW`  |
| `RETAKE_REQUIRED` |
| `REJECTED`        |

### PHOTO_DEFECT

| Value            |
| ---------------- |
| `LOW_LIGHT`      |
| `BLURRY`         |
| `TILTED`         |
| `NOT_PROPERTY`   |
| `DUPLICATE_ROOM` |
| `OBSTRUCTED`     |

### HEARTBEAT_SOURCE

| Value                |
| -------------------- |
| `GUARD_REPORT`       |
| `OWNER_CONFIRMATION` |
| `OPS_VERIFICATION`   |
| `SYSTEM_INFERENCE`   |

### VACANCY_PREDICTION

| Value       |
| ----------- |
| `VACANT`    |
| `OCCUPIED`  |
| `UNCERTAIN` |

Vacancy prediction is distinct from P33 listing freshness states (`FRESH`, `AGING`, `STALE`).

### FRAUD_APPEAL_STATUS

| Value          |
| -------------- |
| `SUBMITTED`    |
| `UNDER_REVIEW` |
| `UPHELD`       |
| `OVERTURNED`   |

### Phase 40 Permissions

| Permission          | Description                                |
| ------------------- | ------------------------------------------ |
| `ai.view`           | View AI scores and explainability payloads |
| `ai.recompute`      | Trigger manual recomputes                  |
| `ai.override`       | Override AI outcomes                       |
| `ai.review_pending` | Review pending AI risk/photo items         |
| `ai.configure`      | Configure AI thresholds and controls       |

### Phase 40 System Config Keys

| Key                            | Default         | Type   | Description                               |
| ------------------------------ | --------------- | ------ | ----------------------------------------- |
| `ai_model`                     | `"gpt-4o-mini"` | string | AI model name                             |
| `ai_timeout_ms`                | `30000`         | number | Per-request timeout                       |
| `ai_max_retries`               | `3`             | number | Max retry count                           |
| `ai_retry_backoff_ms`          | `1000`          | number | Base retry backoff (1x/2x/4x)             |
| `ai_daily_budget_cents`        | `5000`          | number | Daily spend cap (cents)                   |
| `ai_cache_ttl_ms`              | `86400000`      | number | Cache TTL in milliseconds                 |
| `ai_rent_confidence_threshold` | `0.7`           | number | Fair-rent confidence threshold            |
| `ai_photo_accept_threshold`    | `4`             | number | Photo auto-accept threshold               |
| `ai_photo_warn_threshold`      | `2`             | number | Photo warn/retake threshold               |
| `ai_fraud_alert_threshold`     | `60`            | number | Threshold for fraud alert routing         |
| `ai_fraud_block_threshold`     | `80`            | number | Threshold for fraud block routing         |
| `ai_lead_band_hot_min`         | `80`            | number | HOT minimum score threshold               |
| `ai_lead_band_warm_min`        | `50`            | number | WARM minimum score threshold              |
| `ai_lead_band_cool_min`        | `20`            | number | COOL minimum score threshold              |
| `ai_vacancy_fresh_days`        | `3`             | number | P33 freshness threshold for `FRESH`       |
| `ai_vacancy_aging_days`        | `10`            | number | P33 freshness threshold for `AGING`       |
| `ai_vacancy_uncertain_days`    | `30`            | number | AI vacancy prediction uncertain threshold |
| `ai_vacancy_stale_days`        | `90`            | number | Stale vacancy inference threshold         |
| `ai_batch_size`                | `50`            | number | Batch size for scheduled AI recomputes    |
| `ai_batch_concurrency`         | `5`             | number | Parallel AI calls per batch               |
| `ai_cost_warn_pct`             | `80`            | number | Cost warning threshold percent            |
| `ai_cost_critical_pct`         | `95`            | number | Cost critical threshold percent           |

---

## Phase 41 Constants (Supply Channel Diversification)

Reference: [Supply Channel Diversification](features/33-supply-channel-diversification.md)

### SOURCE_CHANNEL

| Value       |
| ----------- |
| `GUARD`     |
| `OWNER`     |
| `SECRETARY` |
| `RESIDENT`  |
| `BROKER`    |
| `CORPORATE` |

### SOURCE_PRIORITY

| Channel     | Priority |
| ----------- | -------- |
| `GUARD`     | `1`      |
| `OWNER`     | `2`      |
| `SECRETARY` | `3`      |
| `RESIDENT`  | `4`      |
| `BROKER`    | `5`      |
| `CORPORATE` | `6`      |

### COLLISION_STATUS

| Value          |
| -------------- |
| `DETECTED`     |
| `UNDER_REVIEW` |
| `RESOLVED`     |

### COLLISION_RESOLUTION_TYPE

| Value           |
| --------------- |
| `PRIORITY_WINS` |
| `SPLIT_CREDIT`  |
| `DISMISSED`     |

### Phase 41 Permissions

| Permission                  | Description                                    |
| --------------------------- | ---------------------------------------------- |
| `supply.sources.view`       | View source-channel intake records             |
| `supply.sources.manage`     | Create/update source-channel intake            |
| `supply.collisions.view`    | View source collisions                         |
| `supply.collisions.resolve` | Resolve source collisions                      |
| `supply.brokers.manage`     | Manage broker registrations and lifecycle      |
| `supply.brokers.suspend`    | Suspend broker based on policy thresholds      |
| `supply.corporate.manage`   | Manage corporate accounts and relocations      |
| `supply.secretary.manage`   | Manage secretary intake                        |
| `supply.resident.manage`    | Manage resident referral intake and conversion |

### Phase 41 System Config Keys

| Key                                            | Default  | Type    | Description                                    |
| ---------------------------------------------- | -------- | ------- | ---------------------------------------------- |
| `supply_broker_min_leads_per_window`           | `5`      | number  | Min leads needed for broker quality evaluation |
| `supply_broker_window_days`                    | `30`     | number  | Broker evaluation window                       |
| `supply_broker_suspension_consecutive_windows` | `2`      | number  | Consecutive bad windows before suspension      |
| `supply_corporate_sla_hours`                   | `48`     | number  | Corporate first-response SLA                   |
| `supply_collision_auto_resolve_enabled`        | `false`  | boolean | Enable auto-resolution by source priority      |
| `supply_resident_bounty_paise`                 | `50000`  | number  | Resident bounty amount (paise)                 |
| `secretary_bounty_amount_paise`                | `50000`  | number  | Secretary bounty amount (paise)                |
| `broker_commission_pct`                        | `5000`   | number  | Broker commission basis points                 |
| `owner_self_list_rate_limit`                   | `3`      | number  | Owner submissions per 24h                      |
| `secretary_submission_rate_limit`              | `10`     | number  | Secretary submissions per 24h                  |
| `resident_referral_rate_limit`                 | `5`      | number  | Resident referrals per 24h                     |
| `broker_submission_rate_limit`                 | `20`     | number  | Broker submissions per 24h                     |
| `corporate_submission_rate_limit`              | `50`     | number  | Corporate submissions per 24h                  |
| `guard_lead_daily_max`                         | `10`     | number  | Guard channel submissions per 24h (P41 intake) |
| `channel_cost_alert_threshold`                 | `100000` | number  | Cost alert threshold (paise) per verified lead |

---

## Phase 42 Constants (Financial Products and Insurance)

Reference: [Financial Products & Insurance](features/34-financial-products-insurance.md)

### RENT_SHIELD_STATUS

| Value            |
| ---------------- |
| `DRAFT`          |
| `QUOTED`         |
| `ACTIVE`         |
| `CLAIM_FILED`    |
| `CLAIM_APPROVED` |
| `CLAIM_PAID`     |
| `EXPIRED`        |
| `CANCELLED`      |
| `LAPSED`         |

### CLAIM_STATUS

| Value            |
| ---------------- |
| `FILED`          |
| `INFO_REQUESTED` |
| `UNDER_REVIEW`   |
| `APPROVED`       |
| `DISBURSED`      |
| `DENIED`         |
| `APPEALED`       |

### CLAIM_TYPE

| Value               |
| ------------------- |
| `UNPAID_RENT`       |
| `PROPERTY_DAMAGE`   |
| `EARLY_TERMINATION` |

### CLAIM_DENIAL_REASON

| Value                   |
| ----------------------- |
| `INSUFFICIENT_EVIDENCE` |
| `POLICY_LAPSED`         |
| `FRAUD_SUSPECTED`       |
| `COVERAGE_EXCEEDED`     |
| `EXCLUSION_APPLIES`     |

### DEPOSIT_LITE_STATUS

| Value            |
| ---------------- |
| `ENROLLED`       |
| `ACTIVE`         |
| `CLAIM_ELIGIBLE` |
| `CLAIM_FILED`    |
| `SETTLED`        |
| `EXPIRED`        |
| `CANCELLED`      |

### DEPOSIT_FINANCE_LOAN_STATUS

| Value         |
| ------------- |
| `APPLIED`     |
| `APPROVED`    |
| `DISBURSED`   |
| `REPAYING`    |
| `COMPLETED`   |
| `DEFAULTED`   |
| `WRITTEN_OFF` |
| `CANCELLED`   |

### REPAYMENT_STATUS

| Value      |
| ---------- |
| `UPCOMING` |
| `DUE`      |
| `PAID`     |
| `OVERDUE`  |
| `WAIVED`   |

### CREDIT_REPORTING_ACCOUNT_STATUS

| Value                |
| -------------------- |
| `CONSENT_OBTAINED`   |
| `REPORTING`          |
| `CORRECTION_PENDING` |
| `CORRECTED`          |
| `PAUSED`             |
| `CLOSED`             |

### CONSENT_TYPE

| Value              |
| ------------------ |
| `CREDIT_REPORTING` |
| `DATA_SHARING`     |
| `LENDING`          |

### ACCOUNT_TYPE

| Value              |
| ------------------ |
| `TENANT_WALLET`    |
| `OWNER_WALLET`     |
| `PLATFORM_REVENUE` |
| `PARTNER_PAYABLE`  |
| `ESCROW`           |
| `TAX_LIABILITY`    |

### ENTRY_TYPE

| Value    |
| -------- |
| `DEBIT`  |
| `CREDIT` |

### CREDIT_BUREAU

| Value            |
| ---------------- |
| `CIBIL`          |
| `EXPERIAN_INDIA` |
| `CRIF`           |

### Phase 42 Permissions

| Permission                    | Description                             |
| ----------------------------- | --------------------------------------- |
| `financial.policies.view`     | View policy rows                        |
| `financial.policies.issue`    | Issue policy / quote                    |
| `financial.policies.cancel`   | Cancel policy                           |
| `financial.claims.view`       | View claims queue                       |
| `financial.claims.adjudicate` | Adjudicate claims                       |
| `financial.loans.view`        | View loan lifecycle data                |
| `financial.loans.sync`        | Sync loan status from partner callbacks |
| `financial.credit.view`       | View credit reporting rows              |
| `financial.credit.submit`     | Submit/correct credit reports           |
| `financial.ledger.view`       | View ledger and balances                |
| `financial.reconcile`         | Reconcile ledger/partner mismatches     |
| `financial.audit_export`      | Export regulatory audit bundles         |
| `financial.configure`         | Configure financial product keys        |

### Phase 42 System Config Keys

| Key                                  | Default    | Type    | Description                           |
| ------------------------------------ | ---------- | ------- | ------------------------------------- |
| `irdai_license_verified`             | `false`    | boolean | Rent Shield issuance gate             |
| `irdai_cooling_off_days`             | `15`       | number  | IRDAI cooling-off period              |
| `claim_auto_approve_threshold`       | `5000000`  | number  | Auto-approve claim threshold (paise)  |
| `deposit_lite_annual_fee_paise`      | `99900`    | number  | Deposit Lite fixed annual fee         |
| `deposit_lite_coverage_pct_bps`      | `100`      | number  | Deposit Lite variable fee component   |
| `loan_max_term_months`               | `12`       | number  | Max financing term                    |
| `loan_min_amount_paise`              | `1000000`  | number  | Min financing amount                  |
| `loan_max_amount_paise`              | `50000000` | number  | Max financing amount                  |
| `loan_default_threshold_missed_emis` | `3`        | number  | Missed EMI threshold for default      |
| `loan_writeoff_days`                 | `180`      | number  | Days to write-off after default       |
| `credit_report_frequency_days`       | `30`       | number  | Credit report cadence                 |
| `credit_max_pauses_per_year`         | `2`        | number  | Max annual reporting pauses           |
| `financial_reconciliation_cron_hour` | `3`        | number  | Daily reconciliation cron hour (UTC)  |
| `premium_collection_batch_size`      | `100`      | number  | Monthly premium collection batch size |
| `dpdp_retention_years`               | `8`        | number  | Consent and audit retention           |
| `rs_premium_grace_days`              | `15`       | number  | Rent Shield premium grace days        |
| `df_emi_grace_days`                  | `7`        | number  | EMI grace days                        |
| `cr_reporting_grace_days`            | `5`        | number  | Credit reporting grace days           |
| `df_late_fee_pct_bps`                | `200`      | number  | Late fee basis points after grace     |
| `rs_create_rate_limit`               | `3`        | number  | Policy creation limit per tenant/day  |
| `rs_claim_rate_limit`                | `1`        | number  | Claim filing limit per policy/30d     |
| `df_apply_rate_limit`                | `2`        | number  | Loan apply limit per tenant/30d       |
| `cr_consent_rate_limit`              | `3`        | number  | Credit consent limit per tenant/day   |

### Phase 42 Audit Action Literals

| Action                              |
| ----------------------------------- |
| `financial.policy_created`          |
| `financial.policy_cancelled`        |
| `financial.claim_filed`             |
| `financial.claim_approved`          |
| `financial.claim_denied`            |
| `financial.claim_disbursed`         |
| `financial.loan_applied`            |
| `financial.loan_approved`           |
| `financial.loan_disbursed`          |
| `financial.loan_payment_received`   |
| `financial.loan_defaulted`          |
| `financial.credit_consent_obtained` |
| `financial.credit_consent_revoked`  |
| `financial.credit_report_submitted` |
| `financial.reconciliation_mismatch` |
| `financial.exception_resolved`      |

---

## Phase 43 Additions (Tenant Portal)

Reference: [Premium Tenant Portal](features/35-tenant-portal.md)

### Tenant Inquiry Status Extension

`TENANT_INQUIRY_STATUS` must include `NEGOTIATION_INITIATED` in addition to existing values.

### Audit Actions (Tenant Portal)

| Action                   | Trigger                                  |
| ------------------------ | ---------------------------------------- |
| `TENANT_FAVORITE_ADD`    | Tenant adds listing to backend favorites |
| `TENANT_FAVORITE_REMOVE` | Tenant removes backend favorite          |
| `TENANT_PROFILE_UPDATE`  | Tenant updates profile/preferences       |
| `TENANT_REFERRAL_SHARE`  | Tenant shares referral code/link         |

---

## Phase 44 Additions (OPS Superset Expansion)

Reference: [OPS Superset Expansion](features/35-ops-superset-expansion.md)

### Lead Notes Author Type Extension

`leads.notes_thread.author_type` must support: `ADMIN`, `GUARD`, `OPS`.

### Guard Type Extension

`GUARD_TYPE` remains: `BUILDING_SPECIFIC`, `MAIN_GATE`, `PARK`, `ROVING`.

Note: `SOCIETY_GUARD` is **not** defined in `lib/constants.ts`.

### Phase 44 System Config Keys

| Key                                | Default | Type     | Description                                                                                          |
| ---------------------------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `ops_field_worker_enabled`         | `false` | boolean  | Global feature-flag for OPS field-worker API                                                         |
| `ops_field_worker_canary_user_ids` | `[]`    | string[] | Canary allowlist of OPS user ids                                                                     |
| `default_unassigned_society_id`    | `""`    | string   | Fallback society for OPS backfill/provisioning; must be set to valid society \_id before P44 rollout |

---

## Phase 45 Additions (Multi-Persona Identity Model)

Reference: [Multi-Persona Identity Model](features/36-multi-persona-identity.md)

### Phase 45 System Config Keys

| Key                     | Default | Type    | Description                                                                                                                  |
| ----------------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `multi_persona_enabled` | `false` | boolean | Feature flag for multi-persona UX (persona picker, switcher). Schema migration and backfill can run before this flag is set. |

### Persona Precedence (active_persona routing)

When a user holds multiple personas, `active_persona` determines which portal they land on after login. The field is set explicitly by the user (via persona switcher) or by the system during account creation/invite acceptance.

| Persona  | Portal Route        | Notes                        |
| -------- | ------------------- | ---------------------------- |
| `GUARD`  | `/guard/dashboard`  | Field worker — mobile-first  |
| `OPS`    | `/ops/dashboard`    | Field worker — mobile-first  |
| `TENANT` | `/tenant/dashboard` | Tenant portal — mobile-first |
| `OWNER`  | `/owner/dashboard`  | Owner portal — mobile-first  |
| `ADMIN`  | `/admin/dashboard`  | Admin panel — desktop-first  |

---

## Phase 36 Monetization Enums

### Fee Slab

| Value           | Rent Range      | Default Fee             | Custom Quote? |
| --------------- | --------------- | ----------------------- | ------------- |
| `LT_20K`        | < ₹20,000       | ₹9,999 (999900 paise)   | No            |
| `BT_20K_40K`    | ₹20,000–₹39,999 | ₹14,999 (1499900 paise) | No            |
| `BT_40K_80K`    | ₹40,000–₹79,999 | ₹22,999 (2299900 paise) | No            |
| `GT_80K_CUSTOM` | ≥ ₹80,000       | Admin quote required    | Yes           |

### Tenant Pass Status

| Value                | Description                                         | Terminal? |
| -------------------- | --------------------------------------------------- | --------- |
| `PURCHASED`          | Payment initiated, awaiting Razorpay webhook        | No        |
| `ACTIVE`             | Payment confirmed, credits available                | No        |
| `PARTIALLY_CONSUMED` | Some credits used, balance > 0                      | No        |
| `CONSUMED`           | All credits used up                                 | Yes       |
| `EXPIRED`            | Passed `expires_at` with unused balance             | Yes       |
| `REFUNDED`           | Admin-initiated refund                              | Yes       |
| `VOIDED`             | Payment failed or admin cancelled before activation | Yes       |

### Tenant Pass Type

| Value               | Price  | Credit Value | Validity |
| ------------------- | ------ | ------------ | -------- |
| `DISCOVERY_BASIC`   | ₹999   | ₹1,500       | 6 months |
| `DISCOVERY_PLUS`    | ₹2,499 | ₹5,000       | 6 months |
| `DISCOVERY_PREMIUM` | ₹4,999 | ₹12,000      | 6 months |

### Promoted Listing Status

| Value             | Description                               | Terminal? |
| ----------------- | ----------------------------------------- | --------- |
| `PENDING_PAYMENT` | Awaiting Razorpay confirmation            | No        |
| `SCHEDULED`       | Paid, `starts_at` in the future           | No        |
| `ACTIVE`          | Currently running                         | No        |
| `PAUSED`          | Auto-paused (listing ineligible or stale) | No        |
| `ENDED`           | Time expired normally                     | Yes       |
| `CANCELLED`       | Admin/owner cancelled                     | Yes       |

### Service Bundle Status

| Value         | Description                              | Terminal? |
| ------------- | ---------------------------------------- | --------- |
| `PENDING`     | Order created, awaiting fulfillment      | No        |
| `IN_PROGRESS` | Partner service being delivered          | No        |
| `COMPLETED`   | Service delivered, commission recognized | Yes       |
| `CANCELLED`   | Order cancelled                          | Yes       |

### Partner Service Category

| Value              | Description       |
| ------------------ | ----------------- |
| `PACKERS_MOVERS`   | Packers & movers  |
| `CLEANING`         | Deep cleaning     |
| `PAINTING`         | Painting services |
| `PEST_CONTROL`     | Pest control      |
| `FURNITURE_RENTAL` | Furniture rental  |
| `OTHER`            | Other services    |

### Commission Model

| Value        | Description                                      |
| ------------ | ------------------------------------------------ |
| `FIXED`      | Fixed commission per order (paise)               |
| `PERCENTAGE` | Percentage of order value (BPS, e.g. 1500 = 15%) |

### Revenue Line Item Type

| Value                | Description                       | Direction |
| -------------------- | --------------------------------- | --------- |
| `FEE_GROSS`          | Platform fee charged              | Credit    |
| `PASS_CREDIT`        | Discovery Pass offset applied     | Debit     |
| `FEE_NET`            | Fee after credits (informational) | Credit    |
| `SERVICE_GROSS`      | Service bundle revenue            | Credit    |
| `PARTNER_COST`       | Cost paid to partner              | Debit     |
| `SERVICE_COMMISSION` | Platform commission on service    | Credit    |
| `PROMOTION_REVENUE`  | Promoted listing payment          | Credit    |
| `REFUND`             | Refund reversal                   | Debit     |
| `ADJUSTMENT`         | Manual adjustment                 | Either    |

### Phase 36 Permissions

| Permission                 | Description                                  |
| -------------------------- | -------------------------------------------- |
| `monetization.view`        | View monetization dashboard and revenue data |
| `monetization.configure`   | Configure fee slabs and pricing              |
| `transaction_fees.manage`  | Create/update/archive fee slabs              |
| `tenant_passes.view`       | View tenant pass records                     |
| `promoted_listings.manage` | Manage promotion campaigns                   |
| `partner_services.manage`  | Manage partner service catalog               |
| `service_bundles.manage`   | Manage service bundle orders                 |
| `revenue.view`             | View revenue reports and ledger              |

### Phase 36 System Config Keys

| Key                                   | Default Value | Type   | Description                  |
| ------------------------------------- | ------------- | ------ | ---------------------------- |
| `fee_slab_lt_20k_paise`               | `999900`      | number | Fee for rent < ₹20K          |
| `fee_slab_bt_20k_40k_paise`           | `1499900`     | number | Fee for rent ₹20K–₹40K       |
| `fee_slab_bt_40k_80k_paise`           | `2299900`     | number | Fee for rent ₹40K–₹80K       |
| `discovery_pass_basic_price_paise`    | `99900`       | number | Basic pass price             |
| `discovery_pass_basic_credit_paise`   | `150000`      | number | Basic pass credit value      |
| `discovery_pass_plus_price_paise`     | `249900`      | number | Plus pass price              |
| `discovery_pass_plus_credit_paise`    | `500000`      | number | Plus pass credit value       |
| `discovery_pass_premium_price_paise`  | `499900`      | number | Premium pass price           |
| `discovery_pass_premium_credit_paise` | `1200000`     | number | Premium pass credit value    |
| `discovery_pass_validity_days`        | `180`         | number | Pass validity (days)         |
| `promotion_7d_price_paise`            | `99900`       | number | 7-day promotion price        |
| `promotion_14d_price_paise`           | `179900`      | number | 14-day promotion price       |
| `promotion_30d_price_paise`           | `299900`      | number | 30-day promotion price       |
| `promoted_listings_max_per_page`      | `3`           | number | Max promoted per page        |
| `promoted_listings_slots`             | `"[1,5,9]"`   | string | JSON array of slot positions |

See [Monetization Foundation](features/28-monetization-foundation.md) for full spec.

---

## Runtime Constant Backfill (lib/constants.ts)

The sections below document exported runtime constants that were previously implicit or undocumented in this file.

### Core Routing & Persona Helpers

#### `PORTAL_ROOT`

Maps each `USER_TYPE` to its default post-login route.

| User Type | Route               |
| --------- | ------------------- |
| `GUARD`   | `/guard/dashboard`  |
| `ADMIN`   | `/admin/dashboard`  |
| `OPS`     | `/ops/dashboard`    |
| `OWNER`   | `/owner/dashboard`  |
| `TENANT`  | `/tenant/dashboard` |

#### `PERSONA_DISPLAY_CONFIG`

Defines persona label, short description, and icon name used in persona-selection UI.

| User Type | Label          | Description                       | Icon Name   |
| --------- | -------------- | --------------------------------- | ----------- |
| `GUARD`   | Security Guard | Submit leads and earn bounties    | `Shield`    |
| `ADMIN`   | Admin          | Manage the platform               | `Settings`  |
| `OPS`     | Field Ops      | Manage visits and closures        | `Briefcase` |
| `OWNER`   | Property Owner | Manage your properties            | `Home`      |
| `TENANT`  | Tenant         | Browse and inquire about listings | `Search`    |

#### `FIELD_WORKER_USER_TYPES`

User types treated as field workers in shared auth/authorization helpers.

| Value   |
| ------- |
| `GUARD` |
| `OPS`   |

#### `OPS_EMAIL_DOMAIN`

Synthetic domain used for OPS phone+password auth emails.

| Constant           | Value                 |
| ------------------ | --------------------- |
| `OPS_EMAIL_DOMAIN` | `@ops.local` |

### Phase 31 Owner/RM Label Helpers

#### `OWNER_LIFECYCLE_LABELS`

Display labels for owner lifecycle stages.

| Stage      | Label    |
| ---------- | -------- |
| `PROSPECT` | Prospect |
| `VERIFIED` | Verified |
| `ACTIVE`   | Active   |
| `MANAGED`  | Managed  |
| `DORMANT`  | Dormant  |
| `CHURNED`  | Churned  |

#### `RM_ASSIGNMENT_STATUS_LABELS`

Display labels for RM assignment states.

| Status       | Label      |
| ------------ | ---------- |
| `ACTIVE`     | Active     |
| `WARNING`    | Warning    |
| `ESCALATED`  | Escalated  |
| `REASSIGNED` | Reassigned |
| `ENDED`      | Ended      |

#### `RM_CHECK_IN_TYPE_LABELS`

| Type              | Label           |
| ----------------- | --------------- |
| `SCHEDULED`       | Scheduled       |
| `ISSUE`           | Issue           |
| `RE_LISTING`      | Re-listing      |
| `OWNER_INITIATED` | Owner Initiated |
| `AD_HOC`          | Ad Hoc          |

#### `RM_CHECK_IN_METHOD_LABELS`

| Method      | Label     |
| ----------- | --------- |
| `CALL`      | Call      |
| `WHATSAPP`  | WhatsApp  |
| `IN_PERSON` | In Person |
| `OTHER`     | Other     |

#### `RM_CHECK_IN_OUTCOME_LABELS`

| Outcome     | Label     |
| ----------- | --------- |
| `RESOLVED`  | Resolved  |
| `PENDING`   | Pending   |
| `ESCALATED` | Escalated |

### Guard / Incentive v2 Label Helpers

#### `GUARD_TYPE_LABELS`

| Guard Type          | Label           |
| ------------------- | --------------- |
| `BUILDING_SPECIFIC` | Building Guard  |
| `MAIN_GATE`         | Main Gate Guard |
| `PARK`              | Park Guard      |
| `ROVING`            | Roving Guard    |
| `SOCIETY_GUARD`     | Society Guard   |

#### `INCENTIVE_CARD_STATUS`

Lifecycle status for incentive cards.

| Value      | Description                |
| ---------- | -------------------------- |
| `active`   | Card can be redeemed/used  |
| `expired`  | Card validity window ended |
| `redeemed` | Card already redeemed      |

#### `QUALITY_TIER_LABELS`

| Tier       | Label    |
| ---------- | -------- |
| `BRONZE`   | Bronze   |
| `SILVER`   | Silver   |
| `GOLD`     | Gold     |
| `PLATINUM` | Platinum |

#### `STREAK_TYPE_LABELS`

| Streak Type      | Label          |
| ---------------- | -------------- |
| `DAILY_ACTIVE`   | Daily Active   |
| `WEEKLY_WARRIOR` | Weekly Warrior |
| `QUALITY_CHAIN`  | Quality Chain  |
| `PERFECT_10`     | Perfect 10     |

#### `PENALTY_TYPE_LABELS`

| Penalty Type       | Label                    |
| ------------------ | ------------------------ |
| `LOW_COMPLETENESS` | Low Completeness         |
| `MISSING_PHOTOS`   | Missing Photos           |
| `FALSE_LEAD`       | False Lead               |
| `NO_SHOW`          | No Show                  |
| `CONSECUTIVE_POOR` | Consecutive Poor Quality |

#### `BONUS_TYPE_LABELS`

| Bonus Type          | Label             |
| ------------------- | ----------------- |
| `FULL_CHECKLIST`    | Full Checklist    |
| `ALL_GPS_PHOTOS`    | All GPS Photos    |
| `WITHIN_SLA`        | Within SLA        |
| `ALL_REQUIRED_DOCS` | All Required Docs |
| `STREAK_MILESTONE`  | Streak Milestone  |

### Phase 22 Referral Label Helpers

#### `REFERRAL_TYPE_LABELS`

| Referral Type    | Label          |
| ---------------- | -------------- |
| `TENANT_FINDING` | Tenant Finding |
| `OWNER_FINDING`  | Owner Finding  |
| `GUARD`          | Guard          |

#### `REFERRAL_STATUS_LABELS`

| Referral Status  | Label          |
| ---------------- | -------------- |
| `PENDING`        | Pending        |
| `QUALIFIED`      | Qualified      |
| `PARTIALLY_PAID` | Partially Paid |
| `FULLY_PAID`     | Fully Paid     |
| `VOIDED`         | Voided         |

#### `REFERRAL_MILESTONE_STATUS_LABELS`

| Milestone Status | Label     |
| ---------------- | --------- |
| `PENDING`        | Pending   |
| `TRIGGERED`      | Triggered |
| `APPROVED`       | Approved  |
| `PAID`           | Paid      |
| `VOIDED`         | Voided    |

### Phase 30 Field Ops Label Helpers

#### `CHECKLIST_TYPE_LABELS`

| Checklist Type        | Label               |
| --------------------- | ------------------- |
| `PROPERTY_INSPECTION` | Property Inspection |
| `MOVE_IN_HANDOVER`    | Move-in Handover    |

#### `CHECKLIST_STATUS_LABELS`

| Checklist Status     | Label              |
| -------------------- | ------------------ |
| `ASSIGNED`           | Assigned           |
| `IN_PROGRESS`        | In Progress        |
| `SUBMITTED`          | Submitted          |
| `UNDER_REVIEW`       | Under Review       |
| `APPROVED`           | Approved           |
| `REJECTED`           | Rejected           |
| `REVISION_REQUESTED` | Revision Requested |

#### `CHECKLIST_DEPTH_LABELS`

| Depth    | Label  |
| -------- | ------ |
| `LIGHT`  | Light  |
| `MEDIUM` | Medium |
| `FULL`   | Full   |

#### `CONDITION_RATING_LABELS`

| Rating      | Label     |
| ----------- | --------- |
| `EXCELLENT` | Excellent |
| `GOOD`      | Good      |
| `FAIR`      | Fair      |
| `POOR`      | Poor      |
| `NA`        | N/A       |

#### `DOCUMENT_REQUIREMENT_TYPE_LABELS`

| Requirement Type | Label             |
| ---------------- | ----------------- |
| `OWNER_DOCS`     | Owner Documents   |
| `TENANT_DOCS`    | Tenant Documents  |
| `SOCIETY_DOCS`   | Society Documents |

#### `DOCUMENT_ITEM_STATUS_LABELS`

| Document Item Status | Label     |
| -------------------- | --------- |
| `PENDING`            | Pending   |
| `COLLECTED`          | Collected |
| `VERIFIED`           | Verified  |
| `REJECTED`           | Rejected  |
| `NA`                 | N/A       |

#### `DOCUMENT_OVERALL_STATUS_LABELS`

| Document Overall Status | Label       |
| ----------------------- | ----------- |
| `NOT_STARTED`           | Not Started |
| `IN_PROGRESS`           | In Progress |
| `COMPLETE`              | Complete    |
| `BLOCKED`               | Blocked     |

#### `REGULATORY_ITEM_TYPE_LABELS`

| Regulatory Item Type  | Label               |
| --------------------- | ------------------- |
| `POLICE_VERIFICATION` | Police Verification |
| `RENT_REGISTRATION`   | Rent Registration   |
| `SOCIETY_NOC`         | Society NOC         |
| `STAMP_DUTY`          | Stamp Duty          |

#### `REGULATORY_STATUS_LABELS`

| Regulatory Status | Label       |
| ----------------- | ----------- |
| `NOT_STARTED`     | Not Started |
| `IN_PROGRESS`     | In Progress |
| `SUBMITTED`       | Submitted   |
| `APPROVED`        | Approved    |
| `REJECTED`        | Rejected    |
| `OVERDUE`         | Overdue     |
| `WAIVED`          | Waived      |

### Phase 36 Monetization Helpers

#### `DEFAULT_FEE_SLABS`

Default monetization slab configuration (`rent_min`/`rent_max` in paise).

| Slab            | `rent_min` | `rent_max` | `fee`     |
| --------------- | ---------- | ---------- | --------- |
| `LT_20K`        | `0`        | `2000000`  | `999900`  |
| `BT_20K_40K`    | `2000000`  | `4000000`  | `1499900` |
| `BT_40K_80K`    | `4000000`  | `8000000`  | `2299900` |
| `GT_80K_CUSTOM` | `8000000`  | `null`     | `0`       |

#### `PASS_TRANSITIONS`

| From                 | Allowed To                                              |
| -------------------- | ------------------------------------------------------- |
| `PURCHASED`          | `ACTIVE`, `VOIDED`                                      |
| `ACTIVE`             | `PARTIALLY_CONSUMED`, `CONSUMED`, `EXPIRED`, `REFUNDED` |
| `PARTIALLY_CONSUMED` | `CONSUMED`, `EXPIRED`, `REFUNDED`                       |
| `CONSUMED`           | _(none)_                                                |
| `EXPIRED`            | `REFUNDED`                                              |
| `REFUNDED`           | _(none)_                                                |
| `VOIDED`             | _(none)_                                                |

#### `PROMOTION_TRANSITIONS`

| From              | Allowed To                     |
| ----------------- | ------------------------------ |
| `PENDING_PAYMENT` | `SCHEDULED`, `CANCELLED`       |
| `SCHEDULED`       | `ACTIVE`, `CANCELLED`          |
| `ACTIVE`          | `PAUSED`, `ENDED`, `CANCELLED` |
| `PAUSED`          | `ACTIVE`, `ENDED`, `CANCELLED` |
| `ENDED`           | _(none)_                       |
| `CANCELLED`       | _(none)_                       |

#### `BUNDLE_TRANSITIONS`

| From          | Allowed To                 |
| ------------- | -------------------------- |
| `PENDING`     | `IN_PROGRESS`, `CANCELLED` |
| `IN_PROGRESS` | `COMPLETED`, `CANCELLED`   |
| `COMPLETED`   | _(none)_                   |
| `CANCELLED`   | _(none)_                   |

### UI Color Map Constants

These constants map enum values to Tailwind badge color classes.

#### `LEAD_STATUS_COLORS`

| Status                | Color                           |
| --------------------- | ------------------------------- |
| `SUBMITTED`           | `bg-blue-100 text-blue-700`     |
| `NEED_INFO`           | `bg-amber-100 text-amber-700`   |
| `POTENTIAL_DUPLICATE` | `bg-yellow-100 text-yellow-700` |
| `VERIFIED`            | `bg-green-100 text-green-700`   |
| `REJECTED`            | `bg-red-100 text-red-700`       |
| `DUPLICATE`           | `bg-gray-100 text-gray-500`     |

#### `VISIT_STATUS_COLORS`

| Status        | Color                           |
| ------------- | ------------------------------- |
| `ASSIGNED`    | `bg-blue-100 text-blue-700`     |
| `CONFIRMED`   | `bg-indigo-100 text-indigo-700` |
| `IN_PROGRESS` | `bg-amber-100 text-amber-700`   |
| `COMPLETED`   | `bg-green-100 text-green-700`   |
| `CANCELLED`   | `bg-gray-100 text-gray-500`     |
| `NO_SHOW`     | `bg-red-100 text-red-700`       |

#### `LISTING_STATUS_COLORS`

| Status      | Color                         |
| ----------- | ----------------------------- |
| `DRAFT`     | `bg-gray-100 text-gray-600`   |
| `PUBLISHED` | `bg-green-100 text-green-700` |
| `ARCHIVED`  | `bg-gray-100 text-gray-500`   |

#### `CLOSURE_STATUS_COLORS`

| Status      | Color                         |
| ----------- | ----------------------------- |
| `PENDING`   | `bg-amber-100 text-amber-700` |
| `CONFIRMED` | `bg-green-100 text-green-700` |
| `CANCELLED` | `bg-red-100 text-red-700`     |

#### `PAYOUT_STATUS_COLORS`

| Status      | Color                           |
| ----------- | ------------------------------- |
| `pending`   | `bg-blue-100 text-blue-700`     |
| `approved`  | `bg-indigo-100 text-indigo-700` |
| `disbursed` | `bg-green-100 text-green-700`   |
| `failed`    | `bg-red-100 text-red-700`       |
| `voided`    | `bg-gray-100 text-gray-500`     |

#### `TENANT_INQUIRY_STATUS_COLORS`

| Status                  | Color                           |
| ----------------------- | ------------------------------- |
| `SUBMITTED`             | `bg-blue-100 text-blue-700`     |
| `REVIEWED`              | `bg-indigo-100 text-indigo-700` |
| `BOUNTY_POSTED`         | `bg-amber-100 text-amber-700`   |
| `GUARD_ACCEPTED`        | `bg-cyan-100 text-cyan-700`     |
| `VISIT_SCHEDULED`       | `bg-purple-100 text-purple-700` |
| `VISIT_COMPLETED`       | `bg-green-100 text-green-700`   |
| `NEGOTIATION_INITIATED` | `bg-orange-100 text-orange-700` |
| `CLOSED`                | `bg-gray-100 text-gray-500`     |
| `REJECTED`              | `bg-red-100 text-red-700`       |
| `EXPIRED`               | `bg-gray-100 text-gray-400`     |

#### `OWNER_SERVICE_REQUEST_STATUS_COLORS`

| Status      | Color                             |
| ----------- | --------------------------------- |
| `SUBMITTED` | `bg-blue-100 text-blue-700`       |
| `CONTACTED` | `bg-indigo-100 text-indigo-700`   |
| `ONBOARDED` | `bg-green-100 text-green-700`     |
| `ACTIVE`    | `bg-emerald-100 text-emerald-700` |
| `REJECTED`  | `bg-red-100 text-red-700`         |
| `DROPPED`   | `bg-gray-100 text-gray-500`       |

#### `SUPPORT_INQUIRY_STATUS_COLORS`

| Status        | Color                         |
| ------------- | ----------------------------- |
| `OPEN`        | `bg-blue-100 text-blue-700`   |
| `IN_PROGRESS` | `bg-amber-100 text-amber-700` |
| `RESOLVED`    | `bg-green-100 text-green-700` |
| `CLOSED`      | `bg-gray-100 text-gray-500`   |

#### `VISIT_BOUNTY_STATUS_COLORS`

| Status      | Color                         |
| ----------- | ----------------------------- |
| `POSTED`    | `bg-amber-100 text-amber-700` |
| `CLAIMED`   | `bg-cyan-100 text-cyan-700`   |
| `EXPIRED`   | `bg-gray-100 text-gray-400`   |
| `COMPLETED` | `bg-green-100 text-green-700` |

#### `OWNER_LIFECYCLE_STAGE_COLORS`

| Stage      | Color                           |
| ---------- | ------------------------------- |
| `PROSPECT` | `bg-slate-100 text-slate-600`   |
| `VERIFIED` | `bg-blue-100 text-blue-700`     |
| `ACTIVE`   | `bg-green-100 text-green-700`   |
| `MANAGED`  | `bg-indigo-100 text-indigo-700` |
| `DORMANT`  | `bg-amber-100 text-amber-700`   |
| `CHURNED`  | `bg-red-100 text-red-700`       |

#### `RM_ASSIGNMENT_STATUS_COLORS`

| Status       | Color                         |
| ------------ | ----------------------------- |
| `ACTIVE`     | `bg-green-100 text-green-700` |
| `WARNING`    | `bg-amber-100 text-amber-700` |
| `ESCALATED`  | `bg-red-100 text-red-700`     |
| `REASSIGNED` | `bg-slate-100 text-slate-500` |
| `ENDED`      | `bg-gray-100 text-gray-500`   |

#### `RM_CHECK_IN_OUTCOME_COLORS`

| Outcome     | Color                         |
| ----------- | ----------------------------- |
| `RESOLVED`  | `bg-green-100 text-green-700` |
| `PENDING`   | `bg-amber-100 text-amber-700` |
| `ESCALATED` | `bg-red-100 text-red-700`     |

#### `REFERRAL_STATUS_COLORS`

| Status           | Color                             |
| ---------------- | --------------------------------- |
| `PENDING`        | `bg-blue-100 text-blue-700`       |
| `QUALIFIED`      | `bg-emerald-100 text-emerald-700` |
| `PARTIALLY_PAID` | `bg-amber-100 text-amber-700`     |
| `FULLY_PAID`     | `bg-green-100 text-green-700`     |
| `VOIDED`         | `bg-red-100 text-red-700`         |

#### `REFERRAL_MILESTONE_STATUS_COLORS`

| Status      | Color                             |
| ----------- | --------------------------------- |
| `PENDING`   | `bg-slate-100 text-slate-700`     |
| `TRIGGERED` | `bg-blue-100 text-blue-700`       |
| `APPROVED`  | `bg-emerald-100 text-emerald-700` |
| `PAID`      | `bg-green-100 text-green-700`     |
| `VOIDED`    | `bg-red-100 text-red-700`         |

### Additional Label Maps

#### `TENANT_INQUIRY_STATUS_LABELS`

| Status                  | Label           |
| ----------------------- | --------------- |
| `SUBMITTED`             | Submitted       |
| `REVIEWED`              | Reviewed        |
| `BOUNTY_POSTED`         | Bounty Posted   |
| `GUARD_ACCEPTED`        | Guard Accepted  |
| `VISIT_SCHEDULED`       | Visit Scheduled |
| `VISIT_COMPLETED`       | Visit Completed |
| `NEGOTIATION_INITIATED` | Negotiation     |
| `CLOSED`                | Closed          |
| `REJECTED`              | Rejected        |
| `EXPIRED`               | Expired         |

#### `OWNER_SERVICE_REQUEST_STATUS_LABELS`

| Status      | Label     |
| ----------- | --------- |
| `SUBMITTED` | Submitted |
| `CONTACTED` | Contacted |
| `ONBOARDED` | Onboarded |
| `ACTIVE`    | Active    |
| `REJECTED`  | Rejected  |
| `DROPPED`   | Dropped   |

#### `SUPPORT_INQUIRY_STATUS_LABELS`

| Status        | Label       |
| ------------- | ----------- |
| `OPEN`        | Open        |
| `IN_PROGRESS` | In Progress |
| `RESOLVED`    | Resolved    |
| `CLOSED`      | Closed      |

### RBAC / Config Helper Collections

#### `ALL_PERMISSIONS`

Flat array derived as `Object.values(PERMISSIONS)`. Used for role validators, seeding, and permission assignment UIs.

#### `OPS_AGENT_PERMISSIONS`

Readonly subset of `PERMISSIONS` assigned to the built-in Ops Agent system role. This list matches the "Ops Agent (System Role)" permission block above.

#### `SYSTEM_CONFIG_KEYS`

Canonical key-name map (`UPPER_SNAKE` constant key -> lower_snake DB key). The keys documented across all "System Config Keys" tables in this file are sourced from this object.

#### `SYSTEM_CONFIG_DEFAULTS`

Canonical default-value map (`SYSTEM_CONFIG_KEYS.*` -> string value) used by seed/bootstrap logic. Defaults in all "System Config Keys" tables are sourced from this object.

#### `P44_CONFIG_KEYS`

| Key                                | Value                              |
| ---------------------------------- | ---------------------------------- |
| `OPS_FIELD_WORKER_ENABLED`         | `ops_field_worker_enabled`         |
| `OPS_FIELD_WORKER_CANARY_USER_IDS` | `ops_field_worker_canary_user_ids` |
| `DEFAULT_UNASSIGNED_SOCIETY_ID`    | `default_unassigned_society_id`    |

#### `P44_DEFAULTS`

| Key                                | Default |
| ---------------------------------- | ------- |
| `OPS_FIELD_WORKER_ENABLED`         | `false` |
| `OPS_FIELD_WORKER_CANARY_USER_IDS` | `[]`    |

#### `P45_CONFIG_KEYS`

| Key                     | Value                   |
| ----------------------- | ----------------------- |
| `MULTI_PERSONA_ENABLED` | `multi_persona_enabled` |

### Phase 46 Additions (CEO Ops Command Center)

#### Phase 46 Permissions (`PERMISSIONS` additions)

| Permission                      | Description                                                     |
| ------------------------------- | --------------------------------------------------------------- |
| `ops_management.view`           | View CEO/OpsHead command-center dashboards and agent KPI health |
| `ops_management.set_targets`    | Create/update KPI targets for OPS agents                        |
| `ops_management.issue_warnings` | Issue warning actions and level escalations                     |
| `ops_management.write_checkins` | Create/update weekly check-in notes and action items            |
| `ops_management.configure`      | Configure command-center policy thresholds                      |

#### Phase 46 System Config Keys (`SYSTEM_CONFIG_KEYS` / `SYSTEM_CONFIG_DEFAULTS` additions)

| Key                            | Default | Type    | Description                                             |
| ------------------------------ | ------- | ------- | ------------------------------------------------------- |
| `warning_quality_threshold`    | `40`    | number  | Quality score threshold to trigger warning workflow     |
| `warning_target_miss_streak`   | `3`     | number  | Consecutive target misses before warning recommendation |
| `warning_sla_breach_count_30d` | `5`     | number  | 30-day SLA breach count threshold                       |
| `warning_inactivity_days`      | `7`     | number  | Inactivity threshold (days) for warning checks          |
| `warning_level1_expiry_days`   | `30`    | number  | Level 1 warning expiry window                           |
| `warning_level2_expiry_days`   | `60`    | number  | Level 2 warning expiry window                           |
| `warning_escalation_auto`      | `true`  | boolean | Auto-escalate warnings when threshold logic is met      |
| `checkin_overdue_days`         | `7`     | number  | Weekly check-in overdue threshold                       |
| `caseload_threshold`           | `15`    | number  | Per-manager caseload threshold for health alerts        |

#### Phase 46 Audit Actions (`AUDIT_ACTIONS` additions)

| Action                            | Description                             |
| --------------------------------- | --------------------------------------- |
| `ops_kpi_target.create`           | KPI target created                      |
| `ops_kpi_target.update`           | KPI target updated                      |
| `ops_kpi_target.cancel`           | KPI target cancelled                    |
| `ops_kpi_target.bulk_create`      | KPI targets created in bulk             |
| `ops_kpi_target.roll_forward`     | KPI targets rolled to next cycle        |
| `ops_warning.issue`               | Warning issued                          |
| `ops_warning.acknowledge`         | Warning acknowledged                    |
| `ops_warning.resolve`             | Warning resolved                        |
| `ops_warning.escalate`            | Warning escalated                       |
| `ops_check_in.create`             | Check-in note created                   |
| `ops_check_in.update`             | Check-in note updated                   |
| `ops_check_in.toggle_action_item` | Check-in action-item completion toggled |

### SLA Helpers

#### `SLA_STATUS`

| Value      | Description                                                |
| ---------- | ---------------------------------------------------------- |
| `ON_TRACK` | Remaining time is above warning threshold                  |
| `WARNING`  | Remaining time is below warning threshold but not breached |
| `BREACHED` | SLA window exceeded                                        |

#### `SLA_POLICIES`

Per-entity SLA policy map used by dashboard/compliance helpers.

| Entity   | Label             | `windowMs`  | `warningThreshold` |
| -------- | ----------------- | ----------- | ------------------ |
| `lead`   | Lead verification | `86400000`  | `0.75`             |
| `visit`  | Visit scheduling  | `172800000` | `0.75`             |
| `payout` | Payout processing | `432000000` | `0.75`             |
