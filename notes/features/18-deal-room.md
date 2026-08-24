# Feature: Deal Room (Implemented)

> **Priority**: Phase 25
> **Personas**: Tenant, Owner, Admin, OPS
> **Dependencies**: Auth (P01), Tenant Inquiry (P19), Chat Infrastructure (P24), Closures (P08)

## Purpose

Deal Room provides a structured, auditable negotiation flow on top of chat channels:

1. AI-assisted term extraction from delivered chat history.
2. Checklist-based term confirmation with per-item tenant/owner responses.
3. Dual signatures and closure linkage to prevent ambiguous term disputes.
4. Admin controls for owner onboarding and moderated conversation flow.

## Entities Involved

| Table                       | Role in Feature                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `chat_channels`             | Stores deal-room channels and channel lifecycle (open/archive/reopen) metadata.              |
| `chat_messages`             | Stores participant/system/admin messages used in negotiation and checklist workflows.        |
| `chat_message_batches`      | Stores AI masking/rewrite batching state for message processing windows.                     |
| `chat_read_receipts`        | Tracks per-user read state and unread calculations for room UX.                              |
| `deal_checklists`           | Stores checklist versions, item states, sharing status, and approval progression.            |
| `deal_checklist_signatures` | Stores tenant/owner signatures and signature hashes for finalized checklist sign-off.        |
| `owner_invites`             | Stores invite tokens and lifecycle state for owner onboarding into room access.              |
| `tenant_inquiries`          | Provides inquiry context used to scope channels, checklists, and owner invites.              |
| `listings`                  | Provides listing context when validating inquiry/owner linkage for room access.              |
| `leads`                     | Provides property context (building/society lineage) for invite metadata and linkage checks. |
| `owners`                    | Resolves canonical owner identity during invite generation and validation.                   |
| `users`                     | Resolves actor and participant identities across checklist, invite, and chat operations.     |
| `user_role_assignments`     | Supports role checks that gate admin/backoffice checklist and invite actions.                |
| `system_config`             | Provides configurable chat/invite settings (batch window, owner invite expiry, limits).      |
| `audit_logs`                | Captures auditable admin chat moderation actions.                                            |

---

## Implemented Scope

### Backend files

- `convex/dealChecklists.ts`
  - create draft checklists (`create`, `createInternal`)
  - generate from chat via action (`generateFromChat`)
  - admin edit/share/regenerate (`editItem`, `share`, `regenerate`)
  - versioning (`version`, `previous_version_id`, supersede workflow)
- `convex/dealChecklistApprovals.ts`
  - party responses per item (`respondToItem`)
  - dispute resolution reset (`resolveDispute`)
  - signature capture and approval finalization (`signOff`)
  - party-facing and signature queries
- `convex/ownerInvites.ts`
  - invite lifecycle (`generateInvite`, `consumeInvite`, `regenerateInvite`)
  - token and inquiry queries (`getByToken`, `getForInquiry`)
  - stale invite expiration (`expireStaleInvites`)
- `convex/actions/dealTermExtraction.ts`
  - structured extraction from delivered messages only
  - OpenAI schema-constrained extraction with truncation and retry fallback
- `convex/closures.ts`
  - `deal_checklist_id` validation for `APPROVED` checklist + inquiry match

### Frontend files

- Deal room UI components: `src/components/deal-room/`
  - `ChecklistView.tsx`, `ChecklistCard.tsx`, `ChecklistItemCard.tsx`, `VersionHistory.tsx`, `SignOffDialog.tsx`
- Admin inquiry sections:
  - `src/app/(admin)/admin/tenant-inquiries/components/deal-checklist-section.tsx`
  - `src/app/(admin)/admin/tenant-inquiries/components/owner-invite-section.tsx`
- Public invite flow:
  - `src/app/(public)/invite/[token]/page.tsx`
  - `src/app/(public)/invite/[token]/join/page.tsx`
- Admin chat controls:
  - `src/app/(admin)/admin/chat/[channelId]/page.tsx`

---

## Data Model (P25)

Implemented tables and key fields are defined in `convex/schema.ts`:

- `deal_checklists`
  - status: `DRAFT`, `SHARED`, `IN_REVIEW`, `APPROVED`, `DISPUTED`, `SUPERSEDED`
  - per-item approvals (`tenant_approval`, `owner_approval`), derived `overall_status`
  - versioning fields: `version`, `previous_version_id`
- `deal_checklist_signatures`
  - signer role: `TENANT` or `OWNER`
  - `signature_hash` (SHA-256 of canonical resolved checklist payload)
- `owner_invites`
  - status: `PENDING`, `CONSUMED`, `EXPIRED`, `REGENERATED`
  - `identity_verified` optional boolean
  - indexes include `by_inquiry_and_status`
- `closures`
  - optional `deal_checklist_id` pointing to `deal_checklists`

See [Convex Schema](../10-convex-schema.md) for full definitions.

---

## Checklist Lifecycle

1. Admin/OPS creates checklist draft manually or by AI extraction.
2. Admin/OPS may edit low-confidence or disputed values while in `DRAFT`.
3. Admin/OPS shares checklist (`DRAFT -> SHARED`).
4. Tenant/owner respond per item (`AGREED` / `DISAGREED` / `COMMENTED`).
5. Checklist enters `IN_REVIEW` or `DISPUTED` based on derived item statuses.
6. Admin/OPS resolves disputes by setting `admin_edited_value`; item approvals reset to `PENDING`.
7. Tenant and owner sign after all items are mutually agreed.
8. On second signature, checklist auto-transitions to `APPROVED` and `approved_at` is set.

Regeneration creates a new draft version and marks previous version `SUPERSEDED`.

State machine details: [State Machines](../04-state-machines.md).

---

## Owner Invite Flow

1. Admin/OPS generates invite for an inquiry channel.
2. Token is consumed by authenticated `OWNER` or promoted `TENANT -> OWNER` user.
3. If `owner_expected_email` is set, consume enforces exact email match.
4. `identity_verified` is set based on expected-email enforcement.
5. Invite consumption links owner user identity and emits a system join message.
6. Expiry is controlled by `chat_owner_invite_expiry_days`; stale pending invites expire via cron/internal mutation.

Invite states are documented in [State Machines](../04-state-machines.md).

---

## AI Term Extraction

`convex/actions/dealTermExtraction.ts` extracts terms from delivered chat messages with:

- model: `gpt-4o-mini`
- hard limits on message count and payload size
- structured response schema (`term_type`, value, source indices, confidence, clarification flag)
- sanitization and mapping from extracted message indices to `source_message_ids`

`generateFromChat` in `convex/dealChecklists.ts` converts extracted terms into draft checklist items and validates source-message ownership by channel.

---

## Closure Linkage

When `deal_checklist_id` is provided during closure create/update:

- linked checklist must exist
- checklist must be `APPROVED`
- checklist inquiry must match closure inquiry path

This ensures closure records only reference finalized bilateral terms.

---

## Admin Chat Controls Used by Deal Room

Implemented admin controls are shared with chat modules:

- send as system/admin: `chatMessages.sendAsAdmin`
- impersonated messages: `chatMessages.sendImpersonated`
- archive/reopen channels: `chatChannels.archive`, `chatChannels.reopen`

Required permissions are in [Constants Reference](../13-constants-reference.md).

---

## Related Docs

- [Convex Schema](../10-convex-schema.md)
- [State Machines](../04-state-machines.md)
- [Constants Reference](../13-constants-reference.md)
- [Tenant Inquiry](13-tenant-inquiry.md)
- [Closure & Payouts](07-closure-and-payouts.md)
