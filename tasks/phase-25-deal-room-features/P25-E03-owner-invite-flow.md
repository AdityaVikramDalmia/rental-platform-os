---
id: P25-E03
title: Owner Invite Flow
phase: 25
status: pending
depends_on: ["P24-E01", "P24-E02", "P20-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-18
---

# P25-E03: Owner Invite Flow

## Overview

Build the full owner invite lifecycle for deal-room participation: token generation/consumption/regeneration, schema and status modeling for invite records, expiry automation, and owner-facing/admin-facing UI that routes owners through Google SSO into the chat channel.

## Prerequisites

- P24-E01 and P24-E02 must be complete because invite consumption updates chat channel participants.
- P20-E01 must be complete because owner user/account patterns and OWNER role behavior are reused.
- Confirm WorkOS callback routing is stable before adding invite token handoff logic.

## Task Queue

- [ ] P25-E03-T01: Invite Schema + Constants
- [ ] P25-E03-T02: Invite Backend
- [ ] P25-E03-T03: Invite UI

---

## T01: Invite Schema + Constants

### Objective

Add persistent invite table, status enums, and expiry cron automation so invite lifecycle state is explicit, queryable, and operationally reliable.

### Required Reading

- `notes/features/18-deal-room.md` - Invite Security Rules and expiry/regeneration requirements
- `notes/10-convex-schema.md` - schema/index patterns and cron integration examples
- `notes/13-constants-reference.md` - enum and status-color naming conventions

### Key Rules

1. Add `owner_invites` table with fields: `inquiry_id`, `channel_id`, `invite_token`, `owner_expected_email`, `status`, `expires_at`, `consumed_at`, `consumed_by_user_id`, `created_by_admin_id`, `created_at`.
2. Add indexes: `by_token`, `by_inquiry_id`, `by_status`.
3. Add enum `OWNER_INVITE_STATUS` with `PENDING`, `CONSUMED`, `EXPIRED`, `REGENERATED`.
4. Add status colors/constants and any required permission keys for invite management surfaces.
5. Add cron job to mark stale pending invites as `EXPIRED` daily.
6. Ensure cron is idempotent and skips non-pending invites.
7. Add `chat_owner_invite_expiry_days` to system config defaults (`SYSTEM_CONFIG_DEFAULTS` in `lib/constants.ts`) with default value `"7"` if not already present from P24-E01. This config key controls invite link expiry duration in days.

### Deliverables

- [ ] `convex/schema.ts` - `owner_invites` table + indexes
- [ ] `lib/constants.ts` - `OWNER_INVITE_STATUS` enum (+ colors/permissions as needed)
- [ ] `convex/crons.ts` - daily invite expiry job

### Acceptance Criteria

1. `owner_invites` table and indexes compile and support required query paths.
2. Invite status enum values match backend logic exactly.
3. Expiry cron transitions only eligible invites to `EXPIRED`.
4. Cron reruns are safe (no duplicate side effects).
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts`, `lib/constants.ts`, and `convex/crons.ts`.

### Out of Scope

- Invite landing page UX
- Admin invite management controls
- Chat transcript management and impersonation features

---

## T02: Invite Backend

### Objective

Implement backend invite token lifecycle functions that allow admins to generate/regenerate secure owner invites and owners to consume invites safely after Google SSO.

### Required Reading

- `notes/features/18-deal-room.md` - Owner Invite Flow and Invite Security Rules
- `notes/11-convex-architecture.md` - auth helper patterns, mutation design, action/mutation separation
- `notes/10-convex-schema.md` - chat channel fields related to invite participation and owner linkage

### Key Rules

1. Create `convex/ownerInvites.ts` with wrapped exports from `./functions`.
2. Implement `generateInvite` mutation (admin) with `crypto.randomUUID()` invite token, expiry timestamp, optional expected email, and inquiry/channel linkage.
3. Implement `consumeInvite` mutation (called after Google SSO) to validate token, expiry, optional email binding, and invite status.
4. On successful consume, bind owner user to channel participants and mark invite consumed.
5. Insert a system chat message such as `Owner joined` after successful invite consumption.
6. Implement `regenerateInvite` mutation that invalidates prior token and creates a fresh pending invite.
7. Implement queries: `getByToken` (public-safe for landing validation) and `getForInquiry` (admin status view).
8. Expiry duration must read `chat_owner_invite_expiry_days` from `system_config` with default 7.
9. Use the WorkOS `state` parameter to carry the invite token through the OAuth redirect chain. Before redirecting to Google SSO, encode the token: `Buffer.from(JSON.stringify({ invite_token })).toString('base64')` and pass as the `state` param to `getAuthorizationUrl()`. In the callback handler, decode the state to recover the invite token and call `consumeInvite`. WorkOS guarantees the `state` value is returned exactly as passed through the redirect.

### Deliverables

- [ ] `convex/ownerInvites.ts` - generate/consume/regenerate mutations and token/inquiry queries

### Acceptance Criteria

1. Invite tokens are cryptographically random UUIDs and one-time consumable.
2. Consumption rejects expired, invalid, regenerated, or email-mismatched invites.
3. Successful consume updates channel participant linkage and invite status atomically.
4. Regeneration invalidates prior token and starts a new expiry window.
5. System join message is emitted on successful consume.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/ownerInvites.ts`.

### Out of Scope

- Admin chat moderation/transcript controls
- Checklist approvals or signature hashing
- Negotiation room invite logic (P26)

---

## T03: Invite UI

### Objective

Build owner and admin UI for invite lifecycle: token landing and validation for owners, plus admin generation/copy/regeneration/status controls integrated into inquiry detail workflows.

### Required Reading

- `notes/features/18-deal-room.md` - Owner and Admin user stories for invite flow
- `notes/06-admin-panel-ux.md` - admin action panel/table patterns
- `notes/01-tech-stack.md` - WorkOS callback routing and auth flow behavior

### Key Rules

1. Add owner landing route `src/app/(public)/invite/[token]/page.tsx`. This must be in the `(public)` route group because owners are NOT authenticated when they click the invite link - authentication happens via Google SSO after landing.
2. Landing page validates token via `getByToken`, displays listing context, and prompts Google SSO sign-in.
3. Add admin invite controls in inquiry detail: generate invite, copy invite link, regenerate expired/compromised token, status indicator.
4. After SSO callback and successful consume, redirect owner to the channel chat view.
5. Implement invite token handoff through SSO: when the owner clicks "Sign in with Google", encode the invite token in the WorkOS `state` parameter before redirecting to SSO. After successful authentication in the `/callback` route, decode the state, call `consumeInvite` with the token and authenticated user, then redirect to the channel chat view. This avoids storing the invite token in cookies or localStorage.
6. Expired/invalid tokens must render safe error states with support guidance.
7. Keep invite URLs sharable but consumption one-time by backend enforcement.

### Deliverables

- [ ] `src/app/(public)/invite/[token]/page.tsx` - owner invite landing page
- [ ] Admin inquiry invite management UI updates (generate/copy/regenerate/status)
- [ ] Redirect integration from auth callback to chat after invite consume

### Acceptance Criteria

1. Valid token landing page shows invite context and SSO call-to-action.
2. Invalid/expired token state is handled with clear blocked UX.
3. Admin can generate, copy, and regenerate invite links from inquiry UI.
4. Owner lands in chat after SSO + successful token consume.
5. Build passes without TypeScript errors.
6. `npm run build` succeeds.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on new/changed invite UI files.

### Out of Scope

- Checklist approvals and sign-off UI
- Admin chat transcript and moderation controls
- P26 negotiation room onboarding

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: _TBD_

### What Was Built

_TBD_

### Key File Locations

_TBD_

### Deviations from Spec

_TBD_

### Gotchas for Next Epic

_TBD_
