# Convex authorization sweep — 2026-09-23

A review of every client-callable entry point in the Convex backend before the repository is made public: each exported `query`, `mutation` and `action` (internal functions excluded) and each HTTP route. Gaps outside the negotiation and deal-room area were fixed on branch `fix/authz-hardening`, and each fix has a regression test. Gaps inside that area were fixed afterwards on branch `fix/deal-room-authz` (`09eb83c`, tests in `convex/dealRoomAuthz.test.ts`); their rows are marked **c (fixed, deal room)**.

## Method

- The function list comes from the source: every `export const <name> = query|mutation|action(` in `convex/*.ts` and `convex/actions/*.ts`. That gives 533 public functions after this change; 536 before it, because 3 became internal.
- Each function body was read, along with any local helper it calls, and checked for three things:
  - Is the caller authenticated?
  - Does the check use a role permission (`requirePermission` / `requireAnyPermission`), a persona check, or an ownership/participant check?
  - Does the check run before any data access?
- Every function that uses a permission was checked to make sure the check runs unconditionally before any read or write, and that the permission fits the operation. Reads must use a VIEW permission; writes must use a MANAGE or EDIT permission.
- Public (no-login) functions were checked for exactly which fields they return and whether they are rate-limited.
- The "gate" column below was taken from the code at the commit that adds this file.

## Classes

| Class                | Meaning                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| a                    | Public by design (no login). Returns public-safe fields only; writes are rate-limited.                                           |
| b                    | Authenticated and correctly scoped: a role permission, a persona gate for a self-only record, or an ownership/participant check. |
| c (fixed)            | A gap, fixed in this change.                                                                                                     |
| c (fixed, deal room) | A gap in the negotiation/deal-room area, fixed by the follow-up change `09eb83c`.                                                |

Rows in class b sometimes carry a note, such as a separation-of-duties observation. These notes are reported for follow-up and do not count as gaps. Examples: a person holding a money-moving permission can act on their own record, or a read leaks whether a record exists.

## Summary

|                                                   | Count                                      |
| ------------------------------------------------- | ------------------------------------------ |
| Public functions reviewed (after this change)     | 533                                        |
| a — public by design                              | 10                                         |
| b — gated                                         | 490 (17 carry a follow-up note)            |
| c (fixed) — still public, now gated or trimmed    | 26                                         |
| c (fixed) — made internal                         | 3                                          |
| c (fixed, deal room) — negotiation/deal-room area | 7                                          |
| HTTP routes                                       | 5, plus the auth provider's webhook routes |

## Gaps fixed

| Function                                                                                                                                                               | Location                                           | Before → after                                                                                                                                                                                                                                                                  | Test                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions/migrateIncentiveV3.run` / `rollback`                                                                                                                          | convex/actions/migrateIncentiveV3.ts:121, :330     | A public action with no login check that returned migration plans (user ids and samples). Now `internalAction`; nothing in the web app called it.                                                                                                                               | `incentive v3 migration run/rollback are not client-callable`                                                                                                                                                              |
| `supportInquiries.submit`                                                                                                                                              | convex/supportInquiries.ts:78                      | A public mutation that let callers skip the contact-form route and its shared-secret check. Now `internalMutation`; the HTTP route calls `internal.supportInquiries.submit`.                                                                                                    | `support inquiry submit is internal but the public contact route still accepts`                                                                                                                                            |
| `actions/workos.resetGuardPassword`                                                                                                                                    | convex/actions/workos.ts:219                       | Reset the password of whatever account the client named by WorkOS id, which could be any account, including an admin. The WorkOS id must now belong to the guard `user_id` being reset (`guards.getGuardWorkosUserId`).                                                         | `refuses a WorkOS id that does not belong to the guard being reset`; `resets the password of the matching guard`                                                                                                           |
| `actions/workos.createOpsAccount`                                                                                                                                      | convex/actions/workos.ts:122                       | `guards.create` alone could create an account holding the Ops Agent role. It now also requires `roles.manage`, and the admin UI "Add OPS" button uses the same check.                                                                                                           | `requires roles.manage in addition to guards.create`; `creates the OPS account for a caller who may also grant roles`                                                                                                      |
| `systemConfig.setOpsFieldWorkerEnabled`, `setOpsFieldWorkerCanaryUserIds`, `addOpsFieldWorkerCanaryUser`, `removeOpsFieldWorkerCanaryUser`, `getOpsFieldWorkerRollout` | convex/systemConfig.ts:236, :251, :267, :293, :159 | Required only the ADMIN persona; the read also returned OPS staff phone numbers. All five now require `system.configure`.                                                                                                                                                       | `rejects an admin without system.configure on every rollout entry point`; `allows a system.configure holder to manage the rollout`                                                                                         |
| `users.getById`                                                                                                                                                        | convex/users.ts:277                                | Returned any user's full record to any admin. It now returns `{_id, name, email, phone}`. For another user, email and phone are filled in only when the caller holds `users.manage`.                                                                                            | `returns only a display name for another user without users.manage`; `includes contact details for a users.manage holder and for the caller's own record`; `rejects OPS lookups of other users and non-backoffice callers` |
| `userRoleAssignments.getByUserId`                                                                                                                                      | convex/userRoleAssignments.ts:104                  | Any admin could read any user's role assignments. Reading another user's now requires `roles.view` or `roles.manage`; the caller's own is unchanged. Responses no longer include `assigned_by_admin_id`.                                                                        | `getByUserId requires a roles permission for another user's assignments`                                                                                                                                                   |
| `userRoleAssignments.listByRole`                                                                                                                                       | convex/userRoleAssignments.ts:144                  | Required only the ADMIN persona and returned full user records. Now requires `roles.view` or `roles.manage`, and each user is reduced to id, name, email, type and status.                                                                                                      | `listByRole requires a roles permission and returns a user summary only`                                                                                                                                                   |
| `roles.create`                                                                                                                                                         | convex/roles.ts:26                                 | The caller could set `is_system_role`, which produces a role that cannot be deleted or renamed. The argument has been removed; system roles come only from the seed.                                                                                                            | `does not accept is_system_role from the client and always creates a custom role`                                                                                                                                          |
| `documents.updateNotes`                                                                                                                                                | convex/documents.ts:519                            | Any admin or OPS user could write notes on any requirement. Now only the assignee, or a holder of `closures.edit` (the permission the module's other requirement writes use).                                                                                                   | `updateNotes: other backoffice users need closures.edit; the assignee does not`                                                                                                                                            |
| `documents.generateUploadUrl`                                                                                                                                          | convex/documents.ts:542                            | Any admin or OPS user could mint unlimited upload URLs. It now takes `requirement_id` and `item_id` and applies collectItem's rule: the caller must be the assignee and the item must still be collectable. It is also rate-limited. The OPS documents page passes the two ids. | `generateUploadUrl: only the assignee, only for an item that can still be collected`                                                                                                                                       |
| `checklists.generateUploadUrl`                                                                                                                                         | convex/checklists.ts:663                           | Any guard, admin or OPS user could mint upload URLs. The caller must now be ACTIVE and have an IN_PROGRESS checklist assigned to them; photos can only be attached in that state anyway.                                                                                        | `requires an in-progress checklist assigned to the caller`                                                                                                                                                                 |
| `voiceTranscriptions.generateAudioUploadUrl`                                                                                                                           | convex/voiceTranscriptions.ts:11                   | Any logged-in persona, tenants and owners included. Now field workers only; it is a guard-portal feature.                                                                                                                                                                       | `restricts audio upload URLs to field workers`                                                                                                                                                                             |
| `voiceTranscriptions.transcribe`                                                                                                                                       | convex/voiceTranscriptions.ts:67                   | Any logged-in persona could trigger the paid speech-to-text call. The field-worker gate now runs in `preTranscribeCheck`, before the provider call.                                                                                                                             | `rejects a non-field-worker before the paid transcription call`                                                                                                                                                            |
| `referralCodes.getByCode`                                                                                                                                              | convex/referralCodes.ts:74                         | A public lookup over an enumerable code space that returned the referrer's full name and the code record, internal user id included. Now returns `{referrer: {owner_type}}`, which is all the landing page reads.                                                               | `exposes only the referrer persona, never their name or ids`                                                                                                                                                               |
| `rentalTransactions.listByTenant`, `rentalTransactions.getById` (tenant branch)                                                                                        | convex/rentalTransactions.ts:926, :839             | A tenant received the owner's contact record, the closure's commission and notes, the inquiry's ops notes and the override audit fields. The tenant view now omits them; the staff view is unchanged.                                                                           | `tenant reads omit owner contact, closure economics and inquiry ops fields`                                                                                                                                                |
| `tenantInquiries.acceptBounty`, `listByGuard`, `listBounties` (accepted tab)                                                                                           | convex/tenantInquiries.ts:574, :1137, :1046        | A field worker received the full inquiry (tenant name, phone, email, ops notes) and, through `listByGuard`, the lead with the owner's phone. They now get scheduling and bounty fields only, which is what the bounty cards display.                                            | `accepting and listing bounties never returns the tenant's identity or ops notes`                                                                                                                                          |
| `incentives.getTopGuards`                                                                                                                                              | convex/incentives.ts:2319                          | Any logged-in persona could read the staff leaderboard (names, scores, internal ids). Now field workers only; admins use `getLeaderboard`.                                                                                                                                      | `is limited to field workers`                                                                                                                                                                                              |
| `owners.getMyRmAssignment`                                                                                                                                             | convex/owners.ts:1568                              | Returned the relationship manager's internal performance, SLA, missed-check-in and escalation fields to the owner. Now returns contact and schedule fields only.                                                                                                                | `RM assignment omits the RM's internal performance data; earnings omit payee references`                                                                                                                                   |
| `owners.getMyEarnings`                                                                                                                                                 | convex/owners.ts:1450                              | The rows are field-worker bounty payouts, and they carried the payee's `payment_reference`. That field is no longer returned. What these rows should represent is listed under _Open items_.                                                                                    | same test                                                                                                                                                                                                                  |
| `opsManagement.acknowledgeWarning`                                                                                                                                     | convex/opsManagement.ts:2786                       | Read the warning before any auth check, so an anonymous caller could learn whether a warning id exists. Login is now required first.                                                                                                                                            | `requires a login before touching the warning, and still works for a permitted user`                                                                                                                                       |

The tests are in `convex/authzHardening.test.ts` and `convex/authzHardening.workos.test.ts`. The WorkOS client is mocked; no network calls are made.

## Deal-room gaps (fixed in `09eb83c`)

Room access is now decided from the caller's role in the inquiry (tenant of record, or owner of the listing), not the switchable active persona; backoffice access needs the calling function's permission. A user who is both tenant and owner of the same inquiry sees only rooms visible to both roles.

| Function                                                                                                                         | Location                                                                                                     | Finding                                                                                                                                                                                                                                                                                                                                                                                                              | Reason not fixed                        |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `chatChannels.getByInquiryId`, `chatChannels.getById`, `chatMessages.send`, `chatMessages.listByChannel`, `chatMessages.getById` | convex/chatChannels.ts:195-252 (`requireChatParticipant`), :360, :404; convex/chatMessages.ts:57, :320, :369 | The room-visibility check uses the caller's switchable `active_persona` rather than their role in this inquiry. A tenant who also holds the OWNER persona, and switches to it, can read and post in the ops-owner room of their own inquiry. Suggested fix: check visibility against the resolved party role (TENANT in the tenant branch, OWNER in the owner branch), and derive `sender_role` from that same role. | Deal-room area, owned by another change |
| `dealChecklists.getByInquiry`, `dealChecklists.getById`                                                                          | convex/dealChecklists.ts:677, :727 (helper at :178)                                                          | The VIEW permission is checked only when the legacy `user_type` is ADMIN or OPS. A multi-persona backoffice user whose primary type is TENANT or OWNER takes the participant path instead, and `requireChatParticipant` returns early for any backoffice persona.                                                                                                                                                    | Deal-room area, owned by another change |

## Open items (need a product or owner decision)

- **Exact flat number in public listing data.** `listings.getBySlugPublic`, `listPublished` and `getSimilarListings` return `flat_number`, and the listing cards display it on purpose. Together with the building and society names, that is a precise address, available without login and in bulk. Whether to keep it is a product decision.
- **Owner earnings model.** `owners.getMyEarnings` builds an owner's "earnings" from field-worker bounty payouts. Only the payee's payment reference was removed; the amounts still describe the field worker's payout.
- **Public form rate limits are keyed on caller-supplied values.** `listings.submitInquiry`, `ownerServiceRequests.submit` and the support-inquiry route key their limits on the phone or email the caller sends, so rotating values avoids the limit. A per-listing or global bucket would cap it.
- **HTTP shared-secret checks.** The contact-form and newsletter routes accept requests when the shared secret is not configured. The notification and payment webhook secrets are compared with `===`/`!==` rather than a constant-time compare, although both routes refuse when their secret is unset.
- **Separation of duties.** These rows are class b with a note in the table below: `incentiveDisbursements.approve`/`disburse`, `attribution.overrideAttribution`, `leads.setBounty`, `incentives.manualAward`, `incentiveActors.assign`/`update`, `payouts.overrideAmount`, `rentalAgreements.recordSignature`, `tokenBookings.refundToken`, `verifications.create`. In each, a holder of the permission can act on their own record, or take a step that normally needs a second permission. Every one requires a staff account that already has the relevant permission.
- **Low-severity reads.** `kycPackets.getByTransaction` returns `null` before its persona gate. `owners.getOwnerBasicInfo` returns an owner's phone under `rm.view`. `guards.updateMyPhoto` accepts any image storage id the caller knows.
- **Owner-invite and owner-account flows.** `ownerInvites.getByToken` still returns listing context after the invite is consumed or expired. `actions/workos.createOwnerAccount` reuses an existing account for a known email and adds the OWNER persona to it.
- **Functional (not security).** `checklistTemplates.getById` requires a backoffice persona, but the guard checklist screen calls it.

## HTTP routes

| Route                                                          | Location           | Gate                                                                                             | Class     | Notes                                                             |
| -------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------- |
| Auth provider webhook/action routes (`authKit.registerRoutes`) | convex/http.ts:8   | Provider SDK signature verification                                                              | b         | The handler (`auth.authKitEvent`) is an internal mutation.        |
| `GET /api/listing/<slug>`                                      | convex/http.ts:109 | none (public)                                                                                    | a         | Serves `listings.getBySlugPublic`; see the flat-number open item. |
| `POST /api/public/support-inquiry`                             | convex/http.ts:137 | Shared-secret header when configured; rate limit                                                 | a (fixed) | Now calls the internal `supportInquiries.submit`.                 |
| `POST /api/public/newsletter-subscribe`                        | convex/http.ts:217 | Shared-secret header when configured; internal mutation with per-IP, per-email and global limits | a         |                                                                   |
| `POST /api/notifications/webhook`                              | convex/http.ts:256 | Shared secret required; refuses when unset                                                       | b         | Uses a non-constant-time compare (open item).                     |
| `POST /api/payments/razorpay/webhook`                          | convex/http.ts:295 | HMAC-SHA256 over the raw body; refuses when unset                                                | b         | Uses a non-constant-time compare (open item).                     |

## Full table

`perm:` lists the role permissions the handler checks. The helper names show persona, ownership or participant checks and rate limits.

<!-- prettier-ignore-start -->
<!-- Compact on purpose: column padding would double this section's size. -->

### convex/actions/backfillShadowDeltas.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `run` | action | 44 | perm: shadow_mode.manage (internal assert query) | b |  |

### convex/actions/workos.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `createGuardAccount` | action | 26 | perm: guards.create; checkPermission | b |  |
| `createOpsAccount` | action | 122 | perm: guards.create, roles.manage; checkPermission | c (fixed) | guards.create alone minted an account holding the Ops Agent role -> also requires roles.manage (UI button gated the same way). |
| `resetGuardPassword` | action | 219 | perm: guards.reset_password; checkPermission | c (fixed) | Client-supplied WorkOS id was reset unchecked (any account) -> must equal the WorkOS id of the guard user_id. |
| `createOwnerAccount` | action | 450 | perm: owner_service_requests.manage; checkPermission | b | Reuses an existing WorkOS account for a known email and adds OWNER persona (reported). |

### convex/admins.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 17 | perm: admins.create | b |  |
| `listAdmins` | query | 60 | perm: roles.view | b |  |

### convex/analytics.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getOverviewKPIs` | query | 836 | perm: analytics.view | b |  |
| `getLeadFunnel` | query | 985 | perm: analytics.view | b |  |
| `getLeadTrend` | query | 1077 | perm: analytics.view | b |  |
| `getSocietyComparison` | query | 1280 | perm: analytics.view | b |  |
| `getGuardLeaderboard` | query | 1449 | perm: analytics.view | b |  |
| `getFinancialOverview` | query | 1721 | perm: analytics.view | b |  |
| `getOperationalMetrics` | query | 1962 | perm: analytics.view | b |  |
| `getOpsSupersetGateMetrics` | query | 2071 | perm: analytics.view | b |  |
| `getCommissionTrends` | query | 2342 | perm: analytics.view | b |  |
| `getAttributionFairness` | query | 2356 | perm: analytics.view | b |  |
| `getGamificationEngagement` | query | 2371 | perm: analytics.view | b |  |
| `getModifierEffectiveness` | query | 2388 | perm: analytics.view | b |  |
| `getShadowModeDelta` | query | 2402 | perm: shadow_mode.view | b |  |
| `getPersonaEarnings` | query | 2448 | perm: analytics.view | b |  |

### convex/attribution.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `disputeAttribution` | mutation | 774 | perm: attribution.dispute | b |  |
| `overrideAttribution` | mutation | 802 | perm: attribution.override | b | Manual split recipients unrestricted, may include caller (reported). |
| `getAttribution` | query | 1025 | perm: attribution.view | b |  |
| `getMyEarnings` | query | 1057 | requireAuth | b |  |
| `listByWindow` | query | 1099 | perm: attribution.view | b |  |
| `getDisputeQueue` | query | 1161 | perm: attribution.dispute | b |  |
| `getSplitDistributionSummary` | query | 1183 | perm: attribution.view | b |  |

### convex/auditLogs.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `list` | query | 10 | perm: audit.view | b |  |
| `getById` | query | 144 | perm: audit.view | b |  |
| `getFilterOptions` | query | 214 | perm: audit.view | b |  |

### convex/briefing.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getMorningBriefing` | query | 8 | perm: analytics.view | b |  |

### convex/buildings.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 115 | perm: buildings.create | b |  |
| `update` | mutation | 174 | perm: buildings.edit | b |  |
| `softDelete` | mutation | 261 | perm: buildings.delete | b |  |
| `listBySociety` | query | 297 | perm: buildings.view | b |  |
| `listBySocietyForGuard` | query | 320 | requireFieldWorker | b |  |
| `getById` | query | 351 | perm: buildings.view | b |  |

### convex/chatAIMonitor.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getRecentFailures` | query | 22 | perm: chat.moderate, chat.view | b |  |
| `getPIIStats` | query | 67 | perm: chat.moderate, chat.view | b |  |
| `approveMessage` | mutation | 99 | perm: chat.moderate, chat.view | b |  |
| `rejectMessage` | mutation | 192 | perm: chat.moderate, chat.view | b |  |

### convex/chatChannels.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 255 | perm: chat.admin | b |  |
| `archive` | mutation | 286 | perm: chat.admin | b |  |
| `reopen` | mutation | 315 | perm: chat.admin | b |  |
| `getByInquiryId` | query | 360 | perm: chat.view; requireAuth, requireChatParticipant | c (fixed, deal room) | Room visibility uses the switchable active persona; a tenant who also holds OWNER can reach the ops-owner room. Fixed in `09eb83c`. |
| `getById` | query | 404 | perm: chat.view, chat.view for backoffice; tenant/owner scoped to own inquiries/listings (shared handler); requireAuth, requireChatParticipant | c (fixed, deal room) | Same active-persona room check (requireChatParticipant). Fixed in `09eb83c`. |
| `listMyChannels` | query | 735 | perm: chat.view for backoffice; tenant/owner scoped to own inquiries/listings (shared handler) | b |  |
| `listForOwner` | query | 748 | perm: chat.view for backoffice; tenant/owner scoped to own inquiries/listings (shared handler) | b |  |
| `getByInquiryForTenant` | query | 761 | requireTenant, requireChatParticipant | b |  |
| `trackTenantChatOpened` | mutation | 797 | requireTenant, requireChatParticipant | b |  |
| `listForAdmin` | query | 823 | perm: chat.view | b |  |

### convex/chatMessages.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `send` | mutation | 57 | perm: chat.send; requireAuth, requireChatParticipant, rateLimiter.limit | c (fixed, deal room) | Same active-persona room check; sender_role also from active persona. Fixed in `09eb83c`. |
| `sendAsAdmin` | mutation | 160 | perm: chat.admin | b |  |
| `sendImpersonated` | mutation | 202 | perm: chat.admin | b |  |
| `listByChannel` | query | 320 | perm: chat.view; requireAuth, requireChatParticipant | c (fixed, deal room) | Same active-persona room check. Fixed in `09eb83c`. |
| `getById` | query | 369 | perm: chat.view; requireAuth, requireChatParticipant | c (fixed, deal room) | Same active-persona room check. Fixed in `09eb83c`. |
| `softDeleteMessage` | mutation | 399 | perm: chat.admin | b |  |
| `getFullTranscript` | query | 423 | perm: chat.admin | b |  |

### convex/chatReadReceipts.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `markRead` | mutation | 73 | perm: chat.view; requireAuth, rateLimiter.limit, requireChatParticipant | b |  |
| `getForChannel` | query | 149 | perm: chat.view; requireAuth, requireChatParticipant | b |  |
| `getUnreadCount` | query | 186 | perm: chat.view; requireAuth, requireChatParticipant | b |  |
| `getMyTotalUnread` | query | 206 | requireTenant | b |  |

### convex/checklistTemplates.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getByDepth` | query | 91 | requireBackoffice | b |  |
| `getById` | query | 106 | requireBackoffice | b | requireBackoffice rejects guards although the guard checklist screen calls it (functional bug, reported). |
| `listActive` | query | 117 | requireBackoffice | b |  |

### convex/checklists.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `createInstance` | mutation | 410 | perm: visits.create | b |  |
| `startChecklist` | mutation | 446 | requireAuth, assertAssignedUser | b |  |
| `updateResponse` | mutation | 472 | requireAuth, assertAssignedUser | b |  |
| `submitChecklist` | mutation | 555 | requireAuth, assertAssignedUser | b |  |
| `reviewChecklist` | mutation | 609 | perm: visits.edit | b |  |
| `generateUploadUrl` | mutation | 663 | requireAuth, rateLimiter.limit | c (fixed) | Any guard/admin/OPS -> ACTIVE caller with an IN_PROGRESS checklist assigned to them. |
| `getByVisitId` | query | 706 | requireAuth, assertCanReadChecklist | b |  |
| `getById` | query | 728 | requireAuth, assertCanReadChecklist | b |  |
| `getPhotoUrls` | query | 746 | requireAuth, assertCanReadChecklist | b |  |
| `listForReview` | query | 777 | perm: visits.view | b |  |

### convex/closures.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 576 | perm: closures.create | b |  |
| `getCreateFormLinkOptions` | query | 734 | perm: closures.create | b |  |
| `confirm` | mutation | 864 | perm: closures.confirm | b |  |
| `cancel` | mutation | 1568 | perm: closures.edit | b |  |
| `update` | mutation | 1609 | perm: closures.edit | b |  |
| `generateUploadUrl` | mutation | 1738 | perm: closures.create, closures.edit | b |  |
| `getById` | query | 1746 | perm: closures.view | b |  |
| `list` | query | 1785 | perm: closures.view | b |  |
| `getByLeadId` | query | 1856 | perm: closures.view | b |  |

### convex/commissionEngine.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `evaluate` | mutation | 1214 | perm: commission.configure | b |  |
| `getEvaluation` | query | 1225 | perm: commission.view | b |  |
| `getMyCommissionBreakdown` | query | 1241 | perm: commission.view | b |  |
| `simulateEvaluation` | query | 1288 | perm: commission.view | b |  |
| `simulateBatch` | query | 1311 | perm: commission.view | b |  |
| `getEvaluationHistory` | query | 1376 | perm: commission.view | b |  |
| `getModifierHitRates` | query | 1444 | perm: commission.view | b |  |
| `getVarianceSummary` | query | 1569 | perm: commission.view | b |  |
| `listSimulationClosures` | query | 1685 | perm: commission.view | b |  |

### convex/commissionModifierTemplates.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 200 | perm: commission.configure | b |  |
| `update` | mutation | 242 | perm: commission.configure | b |  |
| `archive` | mutation | 293 | perm: commission.configure | b |  |
| `reactivate` | mutation | 319 | perm: commission.configure | b |  |
| `listByPersona` | query | 345 | perm: commission.view | b |  |
| `getById` | query | 377 | perm: commission.view | b |  |
| `listAll` | query | 387 | perm: commission.view | b |  |

### convex/dealChecklistApprovals.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `respondToItem` | mutation | 164 | requireAuth, resolvePartyRole | b |  |
| `signOff` | mutation | 270 | requireAuth, resolvePartyRole | b |  |
| `resolveDispute` | mutation | 379 | perm: deal_checklists.manage | b |  |
| `getChecklistForParty` | query | 476 | perm: deal_checklists.view; requireAuth, hasBackofficePermission, resolvePartyRole | b |  |
| `getSignatures` | query | 542 | perm: deal_checklists.view; requireAuth, requireBackoffice, hasBackofficePermission, resolvePartyRole | b |  |

### convex/dealChecklists.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `generateFromChat` | action | 355 | checkManagePermission | b |  |
| `create` | mutation | 470 | perm: deal_checklists.manage; rateLimiter.limit | b |  |
| `editItem` | mutation | 487 | perm: deal_checklists.manage | b |  |
| `share` | mutation | 537 | perm: deal_checklists.manage | b |  |
| `regenerate` | mutation | 599 | perm: deal_checklists.manage | b |  |
| `getByInquiry` | query | 677 | perm: deal_checklists.view; requireAuth, ensureChecklistReadAccess | c (fixed, deal room) | Legacy user_type check lets a multi-persona backoffice user skip deal_checklists.view. Fixed in `09eb83c`. |
| `getById` | query | 727 | requireAuth, requireBackoffice, ensureChecklistReadAccess | c (fixed, deal room) | Same legacy user_type bypass. Fixed in `09eb83c`. |
| `listVersions` | query | 763 | perm: deal_checklists.view | b |  |

### convex/dealContributions.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `voidContribution` | mutation | 117 | perm: attribution.override | b |  |
| `listByClosureId` | query | 145 | perm: attribution.view | b |  |
| `listByActor` | query | 162 | perm: attribution.view | b |  |

### convex/depositRecords.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `markPaid` | mutation | 96 | perm: transactions.manage | b |  |
| `confirmByOwner` | mutation | 232 | perm: transactions.manage; requireAdmin | b |  |
| `updateStatus` | mutation | 317 | perm: transactions.manage | b |  |
| `getByTransaction` | query | 370 | perm: transactions.view | b |  |

### convex/documents.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `createRequirementBundle` | mutation | 254 | perm: closures.edit | b |  |
| `collectItem` | mutation | 350 | requireAuth, assertAssignedToUser | b |  |
| `verifyItem` | mutation | 396 | perm: closures.edit | b |  |
| `rejectItem` | mutation | 436 | perm: closures.edit | b |  |
| `markItemNA` | mutation | 475 | perm: closures.edit | b |  |
| `updateNotes` | mutation | 519 | perm: closures.edit; requireAuth | c (fixed) | Any admin/OPS -> assignee, or closures.edit. |
| `generateUploadUrl` | mutation | 542 | requireAuth, assertAssignedToUser, rateLimiter.limit | c (fixed) | Any admin/OPS, unlimited -> assignee of the requirement with a collectable item; rate-limited. Client passes requirement_id/item_id. |
| `generateUploadUrlForOwner` | mutation | 572 | requireOwner, assertOwnerCanAccessRequirement | b |  |
| `collectItemForOwner` | mutation | 598 | requireOwner, assertOwnerCanAccessRequirement | b |  |
| `getMyDocuments` | query | 642 | requireOwner | b |  |
| `getByLeadId` | query | 786 | requireAuth | b |  |
| `getByListingId` | query | 802 | requireAuth | b |  |
| `getByClosureId` | query | 818 | requireAuth | b |  |
| `getLinkedRegulatoryItems` | query | 834 | requireAuth | b |  |
| `getById` | query | 871 | requireAuth, assertCanReadRequirement | b |  |
| `listAssignedToMe` | query | 884 | requireAuth | b |  |

### convex/gamification.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getProfile` | query | 554 | perm: gamification.view | b |  |
| `getMyProfile` | query | 565 | requireAuth | b |  |
| `createQuest` | mutation | 745 | perm: gamification.manage | b |  |
| `updateQuest` | mutation | 793 | perm: gamification.manage | b |  |
| `endQuest` | mutation | 859 | perm: gamification.manage | b |  |
| `listQuests` | query | 879 | perm: gamification.view | b |  |
| `listProfiles` | query | 901 | perm: gamification.view | b |  |

### convex/guardShifts.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 197 | perm: guards.manage_shifts | b |  |
| `update` | mutation | 282 | perm: guards.manage_shifts | b |  |
| `softDelete` | mutation | 410 | perm: guards.manage_shifts | b |  |
| `listByGuard` | query | 431 | perm: guards.view | b |  |
| `getSchedule` | query | 470 | perm: guards.view | b |  |
| `getMySchedule` | query | 491 | requireAuth | b |  |

### convex/guards.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `recomputeQualityScore` | mutation | 505 | perm: quality.view | b | Deterministic write gated by quality.view (reported). |
| `updateProfile` | mutation | 895 | perm: guards.edit | b |  |
| `updateStatus` | mutation | 968 | perm: guards.manage_status | b |  |
| `list` | query | 1067 | perm: guards.view | b |  |
| `getById` | query | 1189 | perm: guards.view | b |  |
| `getMetrics` | query | 1261 | perm: quality.view | b |  |
| `getMyMetrics` | query | 1295 | requireFieldWorkerAuth | b |  |
| `getRemainingLeads` | query | 1315 | requireFieldWorkerAuth | b |  |
| `getLeaderboard` | query | 1345 | perm: quality.view | b |  |
| `search` | query | 1426 | perm: guards.view | b |  |
| `getMyProfile` | query | 1524 | requireFieldWorkerAuth | b |  |
| `recordFingerprint` | mutation | 1563 | requireGuardAuth | b |  |
| `getFingerprintHistory` | query | 1636 | perm: guards.view | b |  |
| `getInFlightItems` | query | 1656 | perm: guards.view | b |  |
| `generateUploadUrl` | mutation | 1702 | requireAuth, rateLimiter.limit | b |  |
| `updateMyPhoto` | mutation | 1719 | requireAuth | b | Accepts any known image storage id (not tied to uploader) (reported). |
| `updateMyLanguage` | mutation | 1747 | requireAuth | b |  |
| `dismissOnboarding` | mutation | 1886 | requireAuth | b |  |

### convex/incentiveActors.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `assign` | mutation | 81 | perm: commission.configure | b | Caller may set their own commission bounds (reported). |
| `update` | mutation | 124 | perm: commission.configure | b | Caller may set their own commission bounds (reported). |
| `deactivate` | mutation | 193 | perm: commission.configure | b |  |
| `getByUser` | query | 219 | perm: commission.view | b |  |
| `listByPersona` | query | 235 | perm: commission.view | b |  |
| `getActiveProfile` | query | 253 | perm: commission.view | b |  |

### convex/incentiveConfig.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `createDraft` | mutation | 83 | perm: commission.configure | b |  |
| `updateDraft` | mutation | 124 | perm: commission.configure | b |  |
| `activate` | mutation | 187 | perm: commission.configure | b |  |
| `archive` | mutation | 231 | perm: commission.configure | b |  |
| `getActive` | query | 284 | perm: commission.view | b |  |
| `getById` | query | 298 | perm: commission.view | b |  |
| `list` | query | 308 | perm: commission.view | b |  |

### convex/incentiveDisbursements.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `approve` | mutation | 202 | perm: disbursement.approve | b | Separation of duties: approver may be the recipient (reported). |
| `disburse` | mutation | 228 | perm: disbursement.approve | b | Gated by disbursement.approve; same actor may approve and disburse (reported). |
| `voidDisbursement` | mutation | 253 | perm: disbursement.void | b |  |
| `listByRecipient` | query | 282 | perm: disbursement.approve; requireAuth | b |  |
| `listByClosure` | query | 319 | perm: attribution.view | b |  |
| `getById` | query | 334 | perm: attribution.view; requireAuth | b |  |

### convex/incentives.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getLeaderboard` | query | 2167 | perm: incentives.view | b |  |
| `getMyLeaderboardPosition` | query | 2218 | requireFieldWorkerAuth | b |  |
| `getTopGuards` | query | 2319 | requireFieldWorkerAuth | c (fixed) | Any logged-in persona (incl. tenant/owner) read the staff roster -> field workers only. |
| `confirm` | mutation | 2352 | perm: incentives.award | b |  |
| `reject` | mutation | 2403 | perm: incentives.award | b |  |
| `manualAward` | mutation | 2438 | perm: incentives.award | b | Caller may award to themselves (reported). |
| `expire` | mutation | 2512 | perm: incentives.expire | b |  |
| `listPending` | query | 2548 | perm: incentives.view | b |  |
| `listActive` | query | 2571 | perm: incentives.view | b |  |
| `getByGuard` | query | 2622 | perm: incentives.view | b |  |
| `getMyQualitySnapshot` | query | 2645 | requireFieldWorkerAuth | b |  |
| `getMyStreaks` | query | 2722 | requireFieldWorkerAuth | b |  |
| `getMyCards` | query | 2743 | requireFieldWorkerAuth | b |  |

### convex/kycPackets.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 65 | perm: kyc.verify | b |  |
| `updateStatus` | mutation | 128 | perm: kyc.verify | b |  |
| `updateVerificationField` | mutation | 194 | perm: kyc.verify | b |  |
| `updateLandlordReference` | mutation | 236 | perm: kyc.verify | b |  |
| `updatePoliceVerification` | mutation | 271 | perm: kyc.verify | b |  |
| `getByTransaction` | query | 352 | perm: kyc.verify; requireAuth | b | Returns null before the persona gate: existence oracle for a known transaction id (reported). |

### convex/leads.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 358 | requireFieldWorker, rateLimiter.limit | b |  |
| `updateByGuard` | mutation | 530 | requireFieldWorker | b |  |
| `requestInfo` | mutation | 706 | perm: leads.request_info | b |  |
| `reject` | mutation | 734 | perm: leads.reject | b |  |
| `markDuplicate` | mutation | 839 | perm: leads.mark_duplicate | b |  |
| `clearDuplicateFlag` | mutation | 890 | perm: leads.mark_duplicate | b |  |
| `setBounty` | mutation | 921 | perm: leads.set_bounty | b | An OPS field worker may set the bounty on a lead they submitted (reported). |
| `list` | query | 950 | perm: leads.view | b |  |
| `getById` | query | 1090 | perm: leads.view | b |  |
| `getStatusCounts` | query | 1158 | perm: leads.view | b |  |
| `getMyLeads` | query | 1219 | requireFieldWorker | b |  |
| `getMyLeadById` | query | 1285 | requireFieldWorker | b |  |
| `getSubmissionCount` | query | 1311 | requireFieldWorker | b |  |

### convex/listings.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 248 | perm: listings.create | b |  |
| `update` | mutation | 343 | perm: listings.edit | b |  |
| `getById` | query | 451 | perm: listings.view | b |  |
| `list` | query | 511 | perm: listings.view | b |  |
| `publish` | mutation | 574 | perm: listings.publish | b |  |
| `submitInquiry` | mutation | 775 | rateLimiter.limit | a | Published listings only; rate limit keyed on caller-supplied phone (bypassable by rotation). |
| `trackWhatsAppClick` | mutation | 806 | rateLimiter.limit | a | Rate-limited per listing; writes a counter row only. |
| `getBySlugPublic` | query | 891 | none (public) | a | Explicit field projection; includes flat_number (deliberate UI choice, flagged for product decision). |
| `addRoommateProfile` | mutation | 994 | perm: listings.edit | b |  |
| `updateRoommateProfile` | mutation | 1030 | perm: listings.edit | b |  |
| `removeRoommateProfile` | mutation | 1105 | perm: listings.edit | b |  |
| `addCommuteLandmark` | mutation | 1122 | perm: listings.edit | b |  |
| `updateCommuteLandmark` | mutation | 1152 | perm: listings.edit | b |  |
| `removeCommuteLandmark` | mutation | 1209 | perm: listings.edit | b |  |
| `getInquiries` | query | 1226 | perm: listings.view_inquiries | b |  |
| `generateUploadUrl` | mutation | 1257 | perm: listings.edit | b |  |
| `addPhoto` | mutation | 1265 | perm: listings.edit | b |  |
| `removePhoto` | mutation | 1326 | perm: listings.edit | b |  |
| `reorderPhotos` | mutation | 1347 | perm: listings.edit | b |  |
| `getPhotosForListing` | query | 1385 | perm: listings.view | b |  |
| `listFeatured` | query | 1411 | none (public) | a | Explicit projection, no private fields. |
| `listPublished` | query | 1463 | none (public) | a | Explicit projection; includes flat_number (flagged, see above). |
| `getInquiryCountPublic` | query | 1556 | none (public) | a | Count only. |
| `getSimilarListings` | query | 1569 | none (public) | a | Explicit projection; includes flat_number (flagged). |

### convex/negotiationChecklist.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `updateChecklistItem` | mutation | 456 | perm: negotiations.manage; requireBackoffice | b |  |
| `waiveItem` | mutation | 537 | perm: negotiations.manage; requireAdmin | b |  |
| `reopenChecklist` | mutation | 577 | perm: negotiations.manage; requireAdmin | b |  |
| `getChecklistStatus` | query | 618 | perm: negotiations.view; requireBackoffice | b |  |

### convex/negotiationProposals.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 273 | perm: negotiations.manage; requireBackoffice, rateLimiter.limit | b |  |
| `edit` | mutation | 378 | perm: negotiations.manage; requireBackoffice | b |  |
| `share` | mutation | 512 | perm: negotiations.manage; requireBackoffice | b |  |
| `supersede` | mutation | 661 | perm: negotiations.manage; requireBackoffice | b |  |
| `list` | query | 719 | perm: negotiations.view; requireBackoffice | b |  |
| `getById` | query | 738 | perm: negotiations.view; requireBackoffice | b |  |
| `signTerms` | mutation | 755 | requireAuth, rateLimiter.limit, resolveSignerRole | b |  |
| `getActiveProposal` | query | 892 | perm: negotiations.view; requireAuth | b |  |
| `getProposalHistory` | query | 956 | perm: negotiations.view; requireBackoffice | b |  |

### convex/negotiationTokens.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `tenantAgreeToPolicy` | mutation | 87 | requireAuth | b |  |
| `recordCollection` | mutation | 182 | perm: negotiations.manage; requireBackoffice | b |  |
| `getForNegotiation` | query | 285 | perm: negotiations.view; requireAuth | b |  |

### convex/negotiations.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `initiate` | mutation | 397 | perm: negotiations.manage; requireBackoffice, rateLimiter.limit | b |  |
| `linkOwnerToNegotiation` | mutation | 425 | perm: negotiations.manage; requireBackoffice | b |  |
| `openOwnerRoom` | mutation | 468 | perm: negotiations.manage; requireBackoffice | b |  |
| `openCombinedRoom` | mutation | 512 | perm: negotiations.manage; requireBackoffice | b |  |
| `markFailed` | mutation | 556 | perm: negotiations.manage; requireAdmin | b |  |
| `markStalled` | mutation | 596 | perm: negotiations.manage; requireAdmin | b |  |
| `markExpired` | mutation | 629 | perm: negotiations.manage; requireAdmin | b |  |
| `generateUploadUrl` | mutation | 668 | perm: negotiations.manage; requireBackoffice | b |  |
| `getRentAgreementFile` | query | 677 | perm: negotiations.view; requireBackoffice | b |  |
| `listRoomsForNegotiation` | query | 934 | perm: negotiations.view; requireAuth | b |  |
| `getById` | query | 986 | perm: negotiations.view; requireBackoffice | b |  |
| `getByInquiryId` | query | 1001 | perm: negotiations.view; requireAuth | b |  |
| `listForAdmin` | query | 1044 | perm: negotiations.view; requireBackoffice | b |  |
| `statusCounts` | query | 1280 | perm: negotiations.view; requireBackoffice | b |  |
| `getDetailForAdmin` | query | 1319 | perm: negotiations.view; requireBackoffice | b |  |
| `flaggedNegotiations` | query | 1406 | perm: negotiations.view; requireBackoffice | b |  |
| `negotiationAnalytics` | query | 1556 | perm: negotiations.view; requireBackoffice | b |  |
| `dismissEscalationFlag` | mutation | 1674 | perm: negotiations.manage; requireAdmin, rateLimiter.limit | b |  |

### convex/notifications.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getPreferences` | query | 381 | requireAuth | b |  |
| `updatePreferences` | mutation | 407 | requireAuth | b |  |
| `listTemplates` | query | 499 | perm: notifications.view | b |  |
| `upsertTemplate` | mutation | 529 | perm: notification_templates.manage | b |  |
| `registerPushSubscription` | mutation | 586 | requireAuth | b |  |
| `unregisterPushSubscription` | mutation | 643 | requireAuth | b |  |
| `listMyPushSubscriptions` | query | 667 | requireAuth | b |  |
| `getMyNotifications` | query | 1652 | requireAuth | b |  |
| `getUnreadCount` | query | 1682 | requireAuth | b |  |
| `markRead` | mutation | 1696 | requireAuth | b |  |
| `markAllRead` | mutation | 1719 | requireAuth | b |  |
| `adminList` | query | 1742 | perm: notifications.view | b |  |
| `adminGetDeadLetter` | query | 1846 | perm: notifications.view | b |  |
| `getRuntimeConfig` | query | 1945 | perm: notifications.view | b |  |

### convex/opsManagement.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getCommandCenterOverview` | query | 1541 | perm: ops_management.view; requireBackoffice | b |  |
| `getMyTargets` | query | 1672 | requireFieldWorker | b |  |
| `createTarget` | mutation | 1687 | perm: ops_management.set_targets; requireBackoffice | b |  |
| `applyTargetTemplate` | mutation | 1735 | perm: ops_management.set_targets; requireBackoffice | b |  |
| `rollForwardTargets` | mutation | 1832 | perm: ops_management.set_targets; requireBackoffice | b |  |
| `updateTarget` | mutation | 1932 | perm: ops_management.set_targets; requireBackoffice | b |  |
| `cancelTarget` | mutation | 1973 | perm: ops_management.set_targets; requireBackoffice | b |  |
| `listTargetsForAgent` | query | 2556 | perm: ops_management.view; requireBackoffice | b |  |
| `listAllTargets` | query | 2606 | perm: ops_management.view; requireBackoffice | b |  |
| `getTargetDetail` | query | 2675 | perm: ops_management.view; requireBackoffice | b |  |
| `issueWarning` | mutation | 2713 | perm: ops_management.issue_warnings; requireBackoffice | b |  |
| `acknowledgeWarning` | mutation | 2786 | perm: ops_management.issue_warnings; requireAuth, requireFieldWorker, requireBackoffice | c (fixed) | Anonymous caller could probe warning existence -> login required before the read. |
| `resolveWarning` | mutation | 2826 | perm: ops_management.issue_warnings; requireBackoffice | b |  |
| `escalateWarning` | mutation | 2872 | perm: ops_management.issue_warnings; requireBackoffice | b |  |
| `listWarningsForAgent` | query | 2956 | perm: ops_management.view; requireBackoffice | b |  |
| `getActiveWarnings` | query | 3017 | perm: ops_management.view; requireBackoffice | b |  |
| `getWarningSummary` | query | 3048 | perm: ops_management.view; requireBackoffice | b |  |
| `getMyWarnings` | query | 3083 | requireFieldWorker | b |  |
| `createCheckIn` | mutation | 3098 | perm: ops_management.write_checkins; requireBackoffice | b |  |
| `updateCheckIn` | mutation | 3133 | perm: ops_management.write_checkins; requireBackoffice | b |  |
| `toggleActionItem` | mutation | 3186 | perm: ops_management.write_checkins; requireBackoffice | b |  |
| `listCheckInsForAgent` | query | 3228 | perm: ops_management.view; requireBackoffice | b |  |
| `getLatestCheckIn` | query | 3268 | perm: ops_management.view; requireBackoffice | b |  |
| `getPreCheckInBrief` | query | 3367 | perm: ops_management.view; requireBackoffice | b |  |
| `getOpenActionItems` | query | 3543 | perm: ops_management.view; requireBackoffice | b |  |
| `getReviewCompliance` | query | 3634 | perm: ops_management.view; requireBackoffice | b |  |
| `getMyCheckIns` | query | 3717 | requireFieldWorker | b |  |
| `getCelebrations` | query | 3731 | perm: ops_management.view; requireBackoffice | b |  |
| `getStagnantPipeline` | query | 3841 | perm: ops_management.view; requireBackoffice | b |  |
| `getTeamHealthHeatmap` | query | 4064 | perm: ops_management.view; requireBackoffice | b |  |
| `getFiresAlert` | query | 4344 | perm: ops_management.view; requireBackoffice | b |  |

### convex/ownerInvites.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `generateInvite` | mutation | 151 | perm: owner_invites.manage | b |  |
| `consumeInvite` | mutation | 227 | requireAuth, rateLimiter.limit | b |  |
| `regenerateInvite` | mutation | 347 | perm: owner_invites.manage | b |  |
| `getByToken` | query | 404 | requireAuth, hasBackofficePermission | a | Bearer token (random UUID); email masked. Returns listing context after the invite is consumed (reported). |
| `getForInquiry` | query | 488 | perm: owner_invites.manage | b |  |

### convex/ownerServiceRequests.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `submit` | mutation | 146 | rateLimiter.limit | a | Public owner form; returns id only; rate limit keyed on caller-supplied phone. |
| `updateStatus` | mutation | 222 | perm: owner_service_requests.manage | b |  |
| `activate` | mutation | 265 | perm: owner_service_requests.manage | b |  |
| `list` | query | 372 | perm: owner_service_requests.view | b |  |
| `getById` | query | 399 | perm: owner_service_requests.view | b |  |
| `getStatusCounts` | query | 415 | perm: owner_service_requests.view | b |  |
| `getSubmittedCount` | query | 439 | perm: owner_service_requests.view | b |  |
| `getMyRequests` | query | 453 | requireOwner | b |  |

### convex/owners.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getById` | query | 688 | perm: owners.view | b |  |
| `getOwnerBasicInfo` | query | 698 | perm: rm.view | b | Owner phone under rm.view, not scoped to the caller's assignments (reported). |
| `list` | query | 824 | perm: owners.view | b |  |
| `search` | query | 838 | perm: owners.view | b |  |
| `updateLifecycle` | mutation | 865 | perm: owners.manage_lifecycle | b |  |
| `updateProfile` | mutation | 937 | perm: owners.edit | b |  |
| `getOwnerLeads` | query | 971 | perm: owners.view | b |  |
| `getOwnerListings` | query | 1001 | perm: owners.view | b |  |
| `getOwnerClosures` | query | 1017 | perm: owners.view | b |  |
| `getGuardProfileName` | query | 1033 | perm: owners.view | b |  |
| `getMyDashboardSummary` | query | 1067 | requireOwner | b |  |
| `getMyOwnerProfile` | query | 1289 | requireOwner | b |  |
| `getMyProperties` | query | 1303 | requireOwner | b |  |
| `getMyLeads` | query | 1373 | requireOwner | b |  |
| `getMyEarnings` | query | 1450 | requireOwner | c (fixed) | Rows are field-worker payouts; payee payment_reference no longer returned (amount semantics escalated). |
| `getMyRmAssignment` | query | 1568 | requireOwner | c (fixed) | Owner received the RM's internal performance/SLA/escalation fields -> contact + schedule fields only. |
| `getMyCheckIns` | query | 1611 | requireOwner | b |  |
| `merge` | mutation | 1636 | perm: owners.merge | b |  |

### convex/payouts.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 131 | perm: payouts.create | b |  |
| `getAdjustment` | query | 186 | perm: payouts.view | b |  |
| `overrideAmount` | mutation | 201 | perm: payouts.approve | b | No record of who overrode; approver may be initiator (reported). |
| `getById` | query | 241 | perm: payouts.view | b |  |
| `list` | query | 268 | perm: payouts.view | b |  |
| `approve` | mutation | 340 | perm: payouts.approve | b |  |
| `disburse` | mutation | 393 | perm: payouts.disburse | b |  |
| `fail` | mutation | 442 | perm: payouts.disburse, payouts.void | b |  |
| `getGuardEarnings` | query | 504 | requireFieldWorkerAuth | b |  |

### convex/referralCodes.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `generate` | mutation | 9 | requireAuth | b |  |
| `getByUser` | query | 62 | requireAuth | b |  |
| `getByCode` | query | 74 | none (public) | c (fixed) | Public, enumerable lookup returned referrer name and code record -> returns referrer persona only. |
| `deactivate` | mutation | 112 | perm: referrals.manage | b |  |

### convex/referralConfig.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `upsert` | mutation | 132 | perm: referrals.configure | b |  |
| `list` | query | 272 | perm: referrals.view | b |  |

### convex/referralMilestones.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getEarningsSummary` | query | 25 | requireAuth | b |  |
| `approve` | mutation | 145 | perm: referrals.approve_payout | b |  |
| `markPaid` | mutation | 176 | perm: referrals.approve_payout | b |  |
| `voidMilestone` | mutation | 209 | perm: referrals.manage | b |  |

### convex/referrals.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `recordGuardReferral` | mutation | 657 | perm: referrals.manage | b |  |
| `recordDemoRentalsReferral` | mutation | 905 | requireAuth | b |  |
| `captureReferralFromCode` | mutation | 933 | requireAuth | b |  |
| `overrideAttribution` | mutation | 1013 | perm: referrals.manage | b |  |
| `getByDeal` | query | 1424 | perm: referrals.view | b |  |
| `getEstimatedBonus` | query | 1465 | perm: referrals.view | b |  |
| `listByReferrer` | query | 1577 | requireAuth | b |  |
| `trackTenantReferralShare` | mutation | 1666 | requireTenant | b |  |
| `getAnalytics` | query | 1692 | perm: analytics.view | b |  |
| `listAll` | query | 1910 | perm: referrals.view | b |  |
| `getById` | query | 1992 | perm: referrals.view | b |  |
| `voidReferral` | mutation | 2024 | perm: referrals.manage | b |  |

### convex/rentalAgreements.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `generate` | mutation | 78 | perm: agreements.generate | b |  |
| `attachDocument` | mutation | 149 | perm: agreements.generate | b |  |
| `send` | mutation | 179 | perm: agreements.generate | b |  |
| `recordSignature` | mutation | 214 | perm: agreements.sign; requireAuth | b | One staff user may record both signatures (reported). |
| `cancel` | mutation | 335 | perm: agreements.generate | b |  |
| `getByTransaction` | query | 370 | perm: transactions.view; requireAuth | b |  |
| `updateStatus` | mutation | 424 | perm: agreements.generate | b |  |

### convex/rentalTransactions.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `createTransaction` | mutation | 367 | perm: transactions.manage | b |  |
| `advanceStatus` | mutation | 482 | perm: transactions.manage | b |  |
| `cancel` | mutation | 528 | perm: transactions.manage | b |  |
| `createMoveInChecklist` | mutation | 552 | perm: transactions.manage | b |  |
| `updateChecklistItem` | mutation | 616 | perm: transactions.manage | b |  |
| `complete` | mutation | 683 | perm: transactions.manage | b |  |
| `getById` | query | 839 | perm: transactions.view; requireAuth | c (fixed) | Tenant branch now returns the same redacted tenant view; staff branch unchanged. |
| `listByTenant` | query | 926 | requireTenant | c (fixed) | Tenant received owner contact record, closure commission/notes, inquiry ops notes, override audit -> removed from tenant view. |
| `listForAdmin` | query | 953 | perm: transactions.view | b |  |
| `listForOps` | query | 1022 | perm: transactions.view | b |  |

### convex/revenueLineItems.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `listByEvent` | query | 6 | perm: revenue.view | b |  |
| `listByClosure` | query | 23 | perm: revenue.view | b |  |
| `getBalanceCheck` | query | 40 | perm: revenue.view | b |  |

### convex/rmAssignments.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `createAssignment` | mutation | 207 | perm: rm.manage | b |  |
| `updateStatus` | mutation | 255 | perm: rm.manage | b |  |
| `reassign` | mutation | 300 | perm: rm.reassign, guards.view | b |  |
| `listByOwner` | query | 374 | perm: rm.view | b |  |
| `listActive` | query | 460 | perm: rm.view | b |  |
| `createCheckIn` | mutation | 514 | perm: rm.check_in | b |  |
| `listCheckIns` | query | 777 | perm: rm.view | b |  |

### convex/roles.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 26 | perm: roles.manage; rateLimiter.limit | c (fixed) | is_system_role removed from args; roles created here are never system roles. |
| `update` | mutation | 69 | perm: roles.manage; rateLimiter.limit | b |  |
| `softDelete` | mutation | 136 | perm: roles.manage; rateLimiter.limit | b |  |
| `list` | query | 166 | perm: roles.view | b |  |
| `getById` | query | 180 | perm: roles.view | b |  |

### convex/shadowMode.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getByClosureId` | query | 258 | perm: shadow_mode.view | b |  |
| `listDeltas` | query | 274 | perm: shadow_mode.view | b |  |
| `getAggregateVariance` | query | 311 | perm: shadow_mode.view | b |  |

### convex/shadowRollout.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getRolloutPolicy` | query | 417 | perm: shadow_mode.view | b |  |
| `updateRolloutPolicy` | mutation | 439 | perm: shadow_mode.manage | b |  |
| `getGuardPayoutSource` | query | 499 | perm: shadow_mode.view | b |  |
| `migrateGuardToV3` | mutation | 516 | perm: shadow_mode.manage | b |  |
| `rollbackGuardToV2` | mutation | 545 | perm: shadow_mode.manage | b |  |
| `checkDecommissionReadiness` | query | 601 | perm: shadow_mode.view | b |  |
| `decommissionV2Shadow` | mutation | 609 | perm: shadow_mode.manage | b |  |

### convex/sla.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getSLAStatus` | query | 53 | perm: analytics.view | b |  |
| `getSLABreachCounts` | query | 116 | perm: analytics.view | b |  |

### convex/societies.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 167 | perm: societies.create | b |  |
| `update` | mutation | 190 | perm: societies.edit | b |  |
| `list` | query | 245 | perm: societies.view | b |  |
| `getById` | query | 282 | perm: societies.view | b |  |
| `search` | query | 316 | perm: societies.view | b |  |

### convex/societyLiaison.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `createRegulatoryItem` | mutation | 111 | perm: closures.edit | b |  |
| `updateStatus` | mutation | 165 | perm: closures.edit | b |  |
| `updateDetails` | mutation | 208 | perm: closures.edit | b |  |
| `assignTo` | mutation | 249 | perm: closures.edit | b |  |
| `linkDocument` | mutation | 279 | perm: closures.edit | b |  |
| `softDelete` | mutation | 314 | perm: closures.edit | b |  |
| `getByClosureId` | query | 330 | perm: closures.view | b |  |
| `getById` | query | 354 | perm: closures.view | b |  |
| `listOverdue` | query | 370 | perm: closures.view | b |  |
| `listAtRisk` | query | 394 | perm: closures.view | b |  |
| `listAssignedToMe` | query | 427 | requireAuth | b |  |
| `statusCounts` | query | 441 | perm: closures.view | b |  |

### convex/supportInquiries.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `updateStatus` | mutation | 152 | perm: support_inquiries.manage | b |  |
| `assign` | mutation | 196 | perm: support_inquiries.manage | b |  |
| `updateOpsNotes` | mutation | 222 | perm: support_inquiries.manage | b |  |
| `list` | query | 244 | perm: support_inquiries.view | b |  |
| `getById` | query | 321 | perm: support_inquiries.view | b |  |
| `getStatusCounts` | query | 337 | perm: support_inquiries.view | b |  |
| `getSubmittedCount` | query | 362 | perm: support_inquiries.view | b |  |

### convex/systemConfig.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `get` | query | 125 | requireBackoffice | b |  |
| `getAll` | query | 148 | perm: system.configure | b |  |
| `getOpsFieldWorkerRollout` | query | 159 | perm: system.configure | c (fixed) | ADMIN persona only -> system.configure (returns OPS staff phones). |
| `setOpsFieldWorkerEnabled` | mutation | 236 | perm: system.configure | c (fixed) | ADMIN persona only -> system.configure. |
| `setOpsFieldWorkerCanaryUserIds` | mutation | 251 | perm: system.configure | c (fixed) | ADMIN persona only -> system.configure. |
| `addOpsFieldWorkerCanaryUser` | mutation | 267 | perm: system.configure | c (fixed) | ADMIN persona only -> system.configure. |
| `removeOpsFieldWorkerCanaryUser` | mutation | 293 | perm: system.configure | c (fixed) | ADMIN persona only -> system.configure. |
| `set` | mutation | 316 | perm: system.configure | b |  |

### convex/tenantDashboard.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getSummary` | query | 176 | requireTenant | b |  |
| `trackDashboardViewed` | mutation | 392 | requireTenant | b |  |

### convex/tenantFavorites.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `list` | query | 76 | requireTenant | b |  |
| `add` | mutation | 111 | requireTenant | b |  |
| `remove` | mutation | 175 | requireTenant | b |  |
| `importFromLocalStorage` | mutation | 218 | requireTenant | b |  |

### convex/tenantInbox.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getUnreadCount` | query | 117 | requireTenant | b |  |
| `getConsolidated` | query | 167 | requireTenant | b |  |

### convex/tenantInquiries.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `submit` | mutation | 323 | requireTenant, rateLimiter.limit | b |  |
| `review` | mutation | 459 | perm: tenant_inquiries.manage | b |  |
| `reject` | mutation | 486 | perm: tenant_inquiries.manage | b |  |
| `postBounty` | mutation | 517 | perm: tenant_inquiries.manage | b |  |
| `acceptBounty` | mutation | 574 | requireFieldWorker | c (fixed) | Returned the full inquiry (tenant phone/email, ops notes) to the field worker -> returns id + status. |
| `scheduleVisit` | mutation | 694 | perm: tenant_inquiries.manage | b |  |
| `expire` | mutation | 773 | perm: tenant_inquiries.manage | b |  |
| `close` | mutation | 794 | perm: tenant_inquiries.manage | b |  |
| `initiateNegotiation` | mutation | 820 | perm: tenant_inquiries.manage | b |  |
| `list` | query | 862 | perm: tenant_inquiries.view | b |  |
| `getById` | query | 935 | perm: tenant_inquiries.view | b |  |
| `getMyInquiries` | query | 948 | requireTenant | b |  |
| `getMyInquiryById` | query | 981 | requireTenant | b |  |
| `getStatusCounts` | query | 1001 | perm: tenant_inquiries.view | b |  |
| `listBounties` | query | 1046 | requireFieldWorker | c (fixed) | Accepted tab spread the full inquiry -> scheduling/bounty fields only. |
| `listByGuard` | query | 1137 | requireFieldWorker | c (fixed) | Spread full inquiry, lead (owner phone), listing, guard -> scheduling/bounty fields + visit times. |
| `getSubmittedCount` | query | 1185 | perm: tenant_inquiries.view | b |  |

### convex/tenantProfile.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getMine` | query | 103 | requireTenant | b |  |
| `updateMine` | mutation | 118 | requireTenant | b |  |

### convex/tokenBookings.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `hold` | mutation | 52 | perm: transactions.manage; requireAdmin | b |  |
| `resolve` | mutation | 155 | perm: transactions.manage | b |  |
| `refundToken` | mutation | 252 | perm: transactions.manage; requireAdmin | b | Refund gated by the broad transactions.manage (reported). |
| `getByTransaction` | query | 332 | perm: transactions.view | b |  |

### convex/transactionFees.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getActiveSlabs` | query | 13 | perm: monetization.view | b |  |
| `upsertSlab` | mutation | 97 | perm: transaction_fees.manage | b |  |

### convex/trustBadges.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `listStaleForAdmin` | query | 417 | perm: trust_badges.view | b |  |
| `getFreshnessCounts` | query | 478 | perm: trust_badges.view | b |  |
| `getForListing` | query | 505 | none (public) | a | Published listings only; badge/freshness data. |

### convex/userRoleAssignments.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `assign` | mutation | 20 | perm: roles.manage | b |  |
| `revoke` | mutation | 65 | perm: roles.manage | b |  |
| `getByUserId` | query | 104 | requireBackoffice; own record, else perm: roles.view or roles.manage | c (fixed) | Other users need roles.view or roles.manage; response omits assigned_by_admin_id. |
| `listByRole` | query | 144 | perm: roles.view or roles.manage | c (fixed) | ADMIN persona only -> roles.view or roles.manage; user projected to id/name/email/type/status. |

### convex/users.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `getCurrentUser` | query | 29 | getAuthenticatedUser | b |  |
| `isMultiPersonaEnabled` | query | 76 | requireAuth | b |  |
| `resolvePostAuthDestination` | query | 84 | getAuthenticatedUser | b |  |
| `clearMustChangePassword` | mutation | 238 | requireAuth | b |  |
| `listAdmins` | query | 259 | perm: admins.create | b |  |
| `getById` | query | 277 | perm: users.manage; requireBackoffice | c (fixed) | Other users: display summary only; contact fields only with users.manage (was full user record for any admin). |
| `updateProfile` | mutation | 315 | requireGuard | b |  |
| `setActivePersona` | mutation | 342 | requireAuth, rateLimiter.limit | b |  |
| `addPersona` | mutation | 374 | perm: users.manage; rateLimiter.limit | b |  |
| `removePersona` | mutation | 397 | perm: users.manage; rateLimiter.limit | b |  |

### convex/verifications.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `listByLead` | query | 22 | perm: leads.view | b |  |
| `create` | mutation | 49 | perm: leads.verify | b | leads.verify can reject a lead without leads.reject (reported). |

### convex/visits.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `create` | mutation | 314 | perm: visits.create | b |  |
| `getById` | query | 419 | perm: visits.view | b |  |
| `list` | query | 445 | perm: visits.view | b |  |
| `getTodayCount` | query | 524 | perm: visits.view | b |  |
| `checkGuardConflicts` | query | 544 | perm: visits.view | b |  |
| `getVisitsByDate` | query | 598 | perm: visits.view | b |  |
| `confirm` | mutation | 638 | perm: visits.edit | b |  |
| `cancel` | mutation | 663 | perm: visits.cancel | b |  |
| `markNoShow` | mutation | 692 | perm: visits.edit | b |  |
| `edit` | mutation | 721 | perm: visits.edit | b |  |
| `start` | mutation | 822 | requireFieldWorker | b |  |
| `complete` | mutation | 872 | requireFieldWorker | b |  |
| `forceComplete` | mutation | 1006 | perm: visits.edit | b |  |
| `getMyGuardVisits` | query | 1104 | requireFieldWorker | b |  |
| `getMyVisits` | query | 1154 | requireTenant | b |  |
| `getMyTodayVisits` | query | 1311 | requireFieldWorker | b |  |
| `getGuardAvailability` | query | 1344 | perm: visits.create, visits.edit | b |  |

### convex/voiceTranscriptions.ts

| Function | Type | Line | Gate | Class | Action / note |
|---|---|---|---|---|---|
| `generateAudioUploadUrl` | mutation | 11 | requireFieldWorkerAuth, rateLimiter.limit | c (fixed) | Any logged-in persona -> field worker (guard portal feature). |
| `transcribe` | action | 67 | requireFieldWorkerAuth + rate limit (internal preTranscribeCheck, before the provider call) | c (fixed) | Any logged-in persona could trigger the paid transcription -> field worker (gate in preTranscribeCheck, before the provider call). |
| `softDelete` | mutation | 115 | requireAuth | b |  |
| `listByEntity` | query | 139 | requireAuth | b |  |

<!-- prettier-ignore-end -->
