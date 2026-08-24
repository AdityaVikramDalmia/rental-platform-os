---
id: P25-E04
title: Admin God-Mode & Chat Management
phase: 25
status: pending
depends_on: ["P24-E02", "P25-E02", "P25-E03"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-18
---

# P25-E04: Admin God-Mode & Chat Management

## Overview

Implement full admin control over deal-room conversations: send-as and impersonation backends with audit flags, moderation actions (freeze/unfreeze/delete transcript visibility), and comprehensive admin chat management/detail experiences for operational oversight.

## Prerequisites

- **Read first**: P25-E02 completion summary for checklist approval/signature UI contracts integrated in detail view.
- **Read first**: P25-E03 completion summary for invite management controls exposed in admin action bars.
- P24-E02 must be complete because this epic extends existing channel/message transport and lifecycle mutations.

## Task Queue

- [ ] P25-E04-T01: Admin Impersonation Backend
- [ ] P25-E04-T02: Admin Chat Actions
- [ ] P25-E04-T03: Admin Chat Management Page
- [ ] P25-E04-T04: Admin Chat Detail View

---

## T01: Admin Impersonation Backend

### Objective

Add admin-only message send surfaces for official DemoRentals messaging and impersonated party messaging with explicit audit metadata and per-message AI bypass controls.

### Required Reading

- `notes/features/18-deal-room.md` - Admin Sends Message and Admin Capabilities Summary sections
- `notes/11-convex-architecture.md` - mutation permission patterns + audit conventions
- `notes/10-convex-schema.md` - chat message fields (`sender_role`, `impersonating_role`, masking flags)

### Key Rules

1. Implement `sendAsAdmin` mutation in `convex/chatMessages.ts`:
   - Signature: `sendAsAdmin({ channel_id: Id<"chat_channels">, content: string })`
   - Sends message with `sender_role: "SYSTEM"`, `is_ai_processed: false`, instant delivery (no batch, no AI rewrite).
   - Creates a `chat_messages` record with `status: "DELIVERED"` immediately.
2. Implement `sendImpersonated` mutation in `convex/chatMessages.ts`:
   - Signature: `sendImpersonated({ channel_id: Id<"chat_channels">, content: string, impersonate_as: "TENANT" | "OWNER", skip_ai: boolean })`
   - Sends message with `sender_role` set to the impersonated party's role.
   - When `skip_ai: true`, message is delivered immediately without AI rewrite. When `skip_ai: false`, message enters the normal batch -> AI rewrite -> delivery pipeline.
3. Both mutations require `chat.admin` permission.
4. Extend `chat_messages` schema with optional impersonation fields (if not already present from P24):
   - `is_impersonated: v.optional(v.boolean())` - `true` only for admin-impersonated messages
   - `impersonated_by_admin_id: v.optional(v.id("users"))` - the admin who sent it
     These fields are `undefined` for normal tenant/owner messages. They MUST be persisted on every impersonated message for audit trail integrity.
5. Ensure all impersonation actions are captured in audit logs with explicit impersonation marker.
6. Restrict both mutations to admin users with chat-management permission.
7. Preserve sender/receiver visibility rules from P24 while tagging impersonated content in admin transcript views.

### Deliverables

- [ ] Chat message backend updates for `sendAsAdmin` and `sendImpersonated` mutation surfaces
- [ ] Audit metadata wiring for impersonated messages

### Acceptance Criteria

1. Admin can send official DemoRentals messages without AI processing delay.
2. Admin can impersonate tenant/owner with optional AI bypass.
3. Impersonated messages carry persistent impersonation metadata for audit.
4. Unauthorized/non-admin send attempts are rejected.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on changed chat backend files.

### Out of Scope

- Channel freeze/unfreeze and transcript retrieval queries
- Admin list/detail pages for operational monitoring
- Invite landing and owner SSO routing

---

## T02: Admin Chat Actions

### Objective

Implement core moderation controls and privileged transcript query support so admins can freeze channels, restore channels, soft-delete messages, and inspect full conversation history including hidden metadata.

### Required Reading

- `notes/features/18-deal-room.md` - admin close/reopen controls, transparency principle, impersonation audit edge case
- `notes/04-state-machines.md` - chat channel status transitions
- `notes/11-convex-architecture.md` - soft-delete and admin auth helper patterns

### Key Rules

1. Implement `archiveChannel` mutation to transition channel status from `ACTIVE` to `ARCHIVED` and block new tenant/owner messages. Admin messages (sendAsAdmin, sendImpersonated) are still allowed on archived channels.
2. Implement `reopenChannel` mutation to transition channel status from `ARCHIVED` back to `ACTIVE`, re-enabling tenant/owner messaging. Note: The state machine in `notes/04-state-machines.md` currently shows `ARCHIVED` as terminal - this task adds the `ARCHIVED -> ACTIVE` transition as part of P25 scope (the state machine doc deferred reopen to P25).
3. Implement `softDeleteMessage` mutation: sets `is_deleted: true` on the message (soft delete per project convention - see `AGENTS.md` Key Conventions). Message is hidden from tenant/owner views but remains visible in admin `getFullTranscript` query and audit logs.
4. Implement `getFullTranscript` admin query returning originals, masked content, deleted-message markers, and impersonation flags.
5. Ensure deletion does not physically remove audit-relevant content from storage.
6. Apply strict admin-only permissions for all moderation mutations and transcript query.

### Deliverables

- [ ] Chat moderation backend mutations (`archiveChannel`, `reopenChannel`, `softDeleteMessage`)
- [ ] Admin transcript query (`getFullTranscript`) with moderation metadata

### Acceptance Criteria

1. Archived channels reject new tenant/owner sends until reopened. Admin sends (sendAsAdmin, sendImpersonated) are still allowed.
2. Message deletion hides content from parties but remains visible in privileged transcript.
3. `getFullTranscript` includes deleted and impersonated message metadata.
4. Audit trail retains moderation actions and actor identity.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on changed moderation/transcript backend files.

### Out of Scope

- Admin table/list UI pages
- Checklist approval flows and signature receipts
- Invite generation/regeneration surfaces

---

## T03: Admin Chat Management Page

### Objective

Create a top-level admin operations page at `/admin/chat` for channel-level monitoring, filtering, and high-level moderation actions.

### Required Reading

- `notes/features/18-deal-room.md` - Admin: Manage Chat Channels acceptance criteria
- `notes/06-admin-panel-ux.md` - table/filter/action patterns
- `tasks/phase-25-deal-room-features/P25-E04-admin-god-mode-chat-management.md` - moderation backend contracts

### Key Rules

1. Add route `src/app/(admin)/admin/chat/page.tsx`.
2. Render table columns: inquiry link, participants, message count, last activity, flagged message count, channel status.
3. Add filters: status, has-flags, date range.
4. Add row actions: archive, reopen, open detail.
5. Use realtime/reactive query patterns for operational freshness.
6. Restrict page access to admins with appropriate chat management permissions.

### Deliverables

- [ ] `src/app/(admin)/admin/chat/page.tsx` - admin chat management page
- [ ] Supporting table/filter/action components for channel operations

### Acceptance Criteria

1. Admin sees all channels with required operational columns.
2. Filters narrow result set correctly by status/flags/date range.
3. Archive/reopen actions execute from the list view.
4. Detail action routes to a metadata-rich channel detail surface.
5. Build passes with no diagnostics errors.
6. `npm run build` succeeds.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on new/changed admin chat list files.

### Out of Scope

- Full transcript message rendering details
- Invite landing/owner auth pages
- Negotiation queue UX for P26

---

## T04: Admin Chat Detail View

### Objective

Build detailed admin channel inspection and intervention UI showing full transcript metadata, impersonation indicators, moderation actions, invite generation entry points, and flagged message review tools.

> **Scope boundary with P25-E02-T04**: P25-E02-T04 owns the standalone checklist management surface (term editing, dispute resolution, version diff, regeneration) within admin inquiry detail. This task (E04-T04) owns the chat transcript detail view - full message history with metadata, moderation actions, impersonation markers, and a summary link to the checklist. These are separate UI surfaces; the detail view may contain a "View Checklist" link/card that navigates to the E02-T04 surface.

### Required Reading

- `notes/features/18-deal-room.md` - admin transparency principle, god-mode controls, checklist management notes
- `tasks/phase-25-deal-room-features/P25-E02-multi-party-approvals-signoff.md` - checklist components/admin management integration
- `tasks/phase-25-deal-room-features/P25-E03-owner-invite-flow.md` - invite management integration points

### Key Rules

1. Detail view must show full transcript including original/masked content, AI status, sender role badges, deleted markers, and impersonation indicators.
2. Provide action bar controls: send as DemoRentals, impersonate tenant/owner (calls `sendAsAdmin`/`sendImpersonated` from T01), archive/reopen channel (calls `archiveChannel`/`reopenChannel` from T02), generate invite link (calls `generateInvite` from P25-E03-T02).
3. Include flagged-message review panel with approve/reject actions for pending review messages.
4. Ensure privileged metadata is admin-only and never leaked into participant UI surfaces.
5. Keep action wiring aligned to backend moderation and impersonation mutations introduced in T01/T02.

### Deliverables

- [ ] Admin chat detail view route/section with full transcript metadata rendering
- [ ] Action bar with impersonation, freeze controls, and invite generation hook
- [ ] Flagged message review panel with moderation actions

### Acceptance Criteria

1. Admin can inspect complete transcript state including hidden/deleted/impersonated markers.
2. Admin can perform core actions from detail view without returning to list page.
3. Flagged message review actions are present and wired to moderation backend.
4. Invite generation is accessible directly from detail view action bar.
5. Build and diagnostics are clean for changed files.
6. `npm run build` succeeds.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on changed admin chat detail files.

### Out of Scope

- Tenant/owner checklist component implementation details
- Owner invite backend/schema tasks
- P26 negotiation-specific room and escalation tooling

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
