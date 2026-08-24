---
id: P13-E01
title: Audit Trail Backend Queries
phase: 13
status: pending
depends_on: ["P01-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P13-E01: Audit Trail Backend Queries

## Overview

Implement the read-only backend for the audit log viewer: a paginated list query with multi-filter support, a single-entry detail query with actor and entity resolution, and a filter options query that returns grouped action types, entity types, and recent actors for UI dropdowns. Audit LOGGING is already in place from P01-E02 via `convex-helpers/server/triggers` in `convex/functions.ts`. This epic creates only QUERY functions in a new `convex/auditLogs.ts` module. No mutations. Audit logs are immutable by design.

## Prerequisites

- **Read first**: [P01-E02 Completion Summary](../phase-01-auth/P01-E02-schema-and-infra.md#completion-summary) — `convex/functions.ts` audit trigger wrapper exists. The `audit_logs` table is in schema with indexes: `by_actor_user_id`, `by_entity`, `by_action`, `by_entity_type`, `by_creation_time`. Triggers auto-insert into `audit_logs` on every mutation that goes through the wrapped `mutation` export. **Verify** the `audit_logs` table and all 5 indexes exist in `convex/schema.ts` before writing queries.

## Task Queue

- [ ] P13-E01-T01: Audit Log List Query
- [ ] P13-E01-T02: Audit Log Detail Query
- [ ] P13-E01-T03: Audit Filter Options Query

---

## T01: Audit Log List Query

### Objective

Create `auditLogs.list` in a new `convex/auditLogs.ts` module: a paginated query returning audit log entries newest-first, with support for 7 filters (actor user ID, actor type, action, entity type, entity ID, date from, date to) and actor name resolution on every returned entry.

### Required Reading

- `notes/07-audit-trail.md` — "Filters" section (the 5 filter types the UI exposes), "Business Rules" section (immutable, read-only, paginated)
- `notes/10-convex-schema.md` — `audit_logs` table definition (lines ~561-633): all fields, validators, and the 5 indexes (`by_actor_user_id`, `by_entity`, `by_action`, `by_entity_type`, `by_creation_time`)
- `notes/13-constants-reference.md` — "Analytics & Audit" permissions section (`audit.view`), "Audit Actor Type" section
- `notes/11-convex-architecture.md` — "Pattern 2: Auth Helpers" section (`requirePermission` pattern), "Pattern 4: Domain File Organization" section (query structure)
- Load `convex-api` skill — pagination API (`paginationOptsValidator`, `.paginate()`, `usePaginatedQuery`)

### Key Rules

1. Create `convex/auditLogs.ts`. Import `query` from `./functions` (NOT from `_generated/server`). Import `paginationOptsValidator` from `convex/server`.
2. `auditLogs.list` args:
   ```
   actor_user_id?: v.optional(v.id("users"))
   actor_type?: v.optional(v.string())
   action?: v.optional(v.string())
   entity_type?: v.optional(v.string())
   entity_id?: v.optional(v.string())
   date_from?: v.optional(v.number())
   date_to?: v.optional(v.number())
   paginationOpts: paginationOptsValidator
   ```
   **Note**: `actor_type` filter enables filtering for SYSTEM actors (who have no `actor_user_id`). When `actor_type === "SYSTEM"`, filter for entries where `actor_user_id` is absent/null. Applied via `.filter()` before pagination.
3. Index selection priority (only ONE index per query; apply remaining filters via `.filter()` in the query builder BEFORE `.paginate()` — Convex requires filters before pagination, not after):
   - `entity_type` + `entity_id` both provided: use `by_entity` index (`["entity_type", "entity_id"]`)
   - `actor_user_id` provided (and no entity_id): use `by_actor_user_id` index
   - `action` provided (and no entity_id, no actor_user_id): use `by_action` index
   - `entity_type` provided alone (no entity_id): use `by_entity_type` index
   - Date range only (no other filters): use `by_creation_time` index with `.gte`/`.lte` range
   - No filters: use default table scan ordered by `_creationTime` descending
4. Always order results newest-first (`.order("desc")`). Apply `.paginate(args.paginationOpts)` as the terminal call.
5. After paginating, resolve `actor_name` for each entry in the result page:
   - If `actor_type === "SYSTEM"` or `actor_user_id` is absent: `actor_name = "System"`
   - Otherwise: look up `users` table by `actor_user_id` and return `user.name`. If the user record is not found (deleted), return `"Unknown"`.
   - Return the enriched page: each entry includes all original `audit_logs` fields plus `actor_name: string`.
6. RBAC: call `requirePermission(ctx, "audit.view")` at the top of the handler before any DB access.
7. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.
8. Date range filters (`date_from`, `date_to`) apply to `_creationTime`. When using a non-`by_creation_time` index, apply date range via `.filter()` in the query chain BEFORE `.paginate()`. All non-indexed filters must be chained as `.filter()` calls before pagination — Convex does not support post-pagination filtering.

### Deliverables

- [ ] `convex/auditLogs.ts` — new module with `auditLogs.list` paginated query, multi-filter index selection, and actor name resolution on each result page entry

### Acceptance Criteria

1. Query returns paginated results ordered newest-first (`_creationTime` descending).
2. All 7 filters work: `actor_user_id`, `actor_type`, `action`, `entity_type`, `entity_id`, `date_from`, `date_to`. `actor_type` filter supports SYSTEM actor selection (entries with no `actor_user_id`).
3. Index selection follows the priority order in Key Rule 3 (most selective first).
4. Every entry in the result page includes a resolved `actor_name` string ("System" for SYSTEM actor type, user name otherwise, "Unknown" if user not found).
5. Query is gated by `requirePermission(ctx, "audit.view")`.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/auditLogs.ts`. Verify no implicit `any` on return types. Confirm `query` is imported from `./functions` and not from `_generated/server`.

### Out of Scope

- Detail query (T02), filter options query (T03), admin UI (P13-E02).

---

## T02: Audit Log Detail Query

### Objective

Create `auditLogs.getById` in `convex/auditLogs.ts`: a single-entry query that returns the full audit log entry with resolved actor name, actor email, and a best-effort entity display label derived from the entity type and entity ID.

### Required Reading

- `notes/07-audit-trail.md` — "Table View" section (columns: Time, Actor, Action, Entity, Changes), "Use Cases" section (what admins look up)
- `notes/10-convex-schema.md` — `audit_logs` table fields (`actor_user_id`, `actor_type`, `action`, `entity_type`, `entity_id`, `changes`, `metadata`), `users` table (for actor name + email resolution)
- `notes/13-constants-reference.md` — "Audit Actor Type" section (GUARD, ADMIN, TENANT, OWNER, SYSTEM), `audit.view` permission
- `notes/11-convex-architecture.md` — "Pattern 12: Soft Delete" section (soft-deleted entities may not be found — handle gracefully)

### Key Rules

1. Add `auditLogs.getById` to `convex/auditLogs.ts`. Import `query` from `./functions`.
2. Args: `{ id: v.id("audit_logs") }`.
3. Fetch the audit log entry via `ctx.db.get(args.id)`. If not found, throw `new Error("Audit log entry not found")`.
4. Resolve actor:
   - If `actor_type === "SYSTEM"` or `actor_user_id` is absent: `actor_name = "System"`, `actor_email = null`.
   - Otherwise: look up `users` table by `actor_user_id`. Return `actor_name = user.name`, `actor_email = user.email`. If user not found: `actor_name = "Unknown"`, `actor_email = null`.
5. Resolve entity display label (best-effort, never throw):
   - `entity_type === "leads"`: look up `leads` table by `entity_id` (cast to `Id<"leads">`). Return label like `"Lead #<short_id>"` using the last 6 characters of the ID. If not found: `entity_label = null`.
   - `entity_type === "users"`: look up `users` table. Return `user.name`. If not found: `entity_label = null`.
   - `entity_type === "societies"`: look up `societies` table. Return `society.name`. If not found: `entity_label = null`.
   - `entity_type === "buildings"`: look up `buildings` table. Return `building.name`. If not found: `entity_label = null`.
   - `entity_type === "visits"`: look up `visits` table. Return `"Visit #<short_id>"`. If not found: `entity_label = null`.
   - `entity_type === "payouts"`: look up `payouts` table. Return `"Payout #<short_id>"`. If not found: `entity_label = null`.
   - All other entity types: `entity_label = null` (no resolution attempted).
   - **Never throw** during entity resolution. The `entity_id` field is `v.string()` in the schema, not a typed `Id<>`. When calling `ctx.db.get()`, cast the fetched entry's `entity_id` to the appropriate ID type (e.g., `entry.entity_id as Id<"leads">`). Wrap EVERY `ctx.db.get()` call in a try/catch block — an invalid or corrupted ID string will throw, and that must not crash the query. Return `entity_label = null` on any error.
6. Return the full audit log entry plus: `actor_name: string`, `actor_email: string | null`, `entity_label: string | null`. Return `changes` array as-is (no transformation).
7. RBAC: call `requirePermission(ctx, "audit.view")` at the top of the handler.
8. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/auditLogs.ts` — `auditLogs.getById` query with actor resolution (name + email) and best-effort entity label resolution for 6 entity types

### Acceptance Criteria

1. Returns the full audit log entry with all original fields intact.
2. `actor_name` resolved correctly for all actor types (System, Guard, Admin, Tenant, Owner, Unknown).
3. `actor_email` resolved for non-system actors; `null` for SYSTEM or when user not found.
4. `entity_label` resolved for leads, users, societies, buildings, visits, payouts; `null` for all other entity types or when entity not found.
5. Entity resolution never throws — returns `null` gracefully when entity is missing or soft-deleted.
6. `changes` array returned as-is without transformation.
7. Gated by `audit.view` permission.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/auditLogs.ts`. Verify all entity resolution branches handle the not-found case without throwing. Confirm return type is explicit (no implicit `any`).

### Out of Scope

- Filter options query (T03), admin UI (P13-E02), entity resolution for referral/chat tables (not yet implemented in V1 pipeline).

---

## T03: Audit Filter Options Query

### Objective

Create `auditLogs.getFilterOptions` in `convex/auditLogs.ts`: a query that returns all valid action strings grouped by entity category, all audited entity types, and a deduplicated list of recent actors from the last 100 audit log entries. This powers the filter dropdowns in the audit viewer UI without requiring expensive full-table scans.

### Required Reading

- `notes/07-audit-trail.md` — "Filters" section (Actor, Action, Entity Type, Entity ID, Date Range dropdowns)
- `notes/10-convex-schema.md` — `audit_logs` table `action` union (lines ~570-615): the complete list of all valid action strings
- `notes/13-constants-reference.md` — "Audit Action Strings" section (all action strings grouped by domain: Society & Building, Users & Guards, Leads, Owner Verification, Listings, Visits, Closures & Payouts, Incentives, RBAC & Config, Referrals, Chat & Deal Room), `audit.view` permission
- `notes/11-convex-architecture.md` — "Pattern 1: The Central Import Point" section (`AUDITED_TABLES` list in `convex/functions.ts`)

### Key Rules

1. Add `auditLogs.getFilterOptions` to `convex/auditLogs.ts`. Import `query` from `./functions`.
2. Args: `{}` (no arguments).
3. **Action types**: Return the hardcoded list of all valid action strings from the schema `action` union, grouped by entity category for UI display. Do NOT scan the database for distinct values. Use the known list from `notes/13-constants-reference.md`. Groups and their items:
   - `"Society & Building"`: `["SOCIETIES_INSERT", "SOCIETIES_UPDATE", "BUILDINGS_INSERT", "BUILDINGS_UPDATE"]`
   - `"Users & Guards"`: `["USERS_INSERT", "USERS_UPDATE", "GUARD_PROFILES_INSERT", "GUARD_PROFILES_UPDATE", "GUARD_SHIFTS_INSERT", "GUARD_SHIFTS_UPDATE", "GUARD_SHIFTS_DELETE"]`
   - `"Leads"`: `["LEADS_INSERT", "LEADS_UPDATE"]`
   - `"Owner Verification"`: `["OWNER_VERIFICATIONS_INSERT"]`
   - `"Listings"`: `["LISTINGS_INSERT", "LISTINGS_UPDATE"]`
   - `"Visits"`: `["VISITS_INSERT", "VISITS_UPDATE"]`
   - `"Closures & Payouts"`: `["CLOSURES_INSERT", "CLOSURES_UPDATE", "PAYOUTS_INSERT", "PAYOUTS_UPDATE"]`
   - `"Incentives"`: `["INCENTIVE_CARDS_INSERT", "INCENTIVE_CARDS_UPDATE"]`
   - `"RBAC & Config"`: `["ROLES_INSERT", "ROLES_UPDATE", "USER_ROLE_ASSIGNMENTS_INSERT", "USER_ROLE_ASSIGNMENTS_UPDATE", "SYSTEM_CONFIG_INSERT", "SYSTEM_CONFIG_UPDATE"]`
   - `"Referrals"`: `["REFERRAL_CODES_INSERT", "REFERRAL_CODES_UPDATE", "REFERRALS_INSERT", "REFERRALS_UPDATE", "REFERRAL_MILESTONES_INSERT", "REFERRAL_MILESTONES_UPDATE", "REFERRAL_CONFIG_INSERT", "REFERRAL_CONFIG_UPDATE"]` (**Note**: `REFERRAL_CODES_UPDATE` is in `convex/schema.ts` action union but omitted from `notes/13-constants-reference.md` — schema is source of truth. Executing agent should verify against the actual schema `action` union.)
   - `"Chat & Deal Room"`: `["CHAT_CHANNELS_INSERT", "CHAT_CHANNELS_UPDATE", "CHAT_MESSAGES_INSERT", "DEAL_CHECKLISTS_INSERT", "DEAL_CHECKLISTS_UPDATE", "DEAL_CHECKLIST_SIGNATURES_INSERT"]`
4. **Entity types**: Return the hardcoded list of all audited entity types from `AUDITED_TABLES` in `convex/functions.ts`:
   ```
   ["societies", "buildings", "users", "guard_profiles", "guard_shifts", "leads",
    "owner_verifications", "listings", "visits", "closures", "payouts",
    "incentive_cards", "roles", "user_role_assignments", "system_config"]
   ```
   Future tables (referrals, chat) are added to this list as they are implemented in later phases.
5. **Recent actors**: Query the last 100 audit log entries using `.order("desc").take(100)` (no index needed — uses default `_creationTime` ordering). From those entries, collect distinct `{ user_id, name, actor_type }` tuples:
   - For each entry where `actor_user_id` is present: look up the user by ID and collect `{ user_id: actor_user_id, name: user.name, actor_type: entry.actor_type }`. If user not found, skip that entry.
   - For entries where `actor_type === "SYSTEM"` (no `actor_user_id`): include one `{ user_id: null, name: "System", actor_type: "SYSTEM" }` entry in the result (deduplicated — only one System entry regardless of how many SYSTEM log entries exist).
   - Deduplicate by `user_id` (keep first occurrence). The System entry deduplicates on `actor_type === "SYSTEM"`.
6. Return format:
   ```typescript
   {
     actions: { group: string; items: string[] }[];
     entity_types: string[];
     recent_actors: { user_id: Id<"users"> | null; name: string; actor_type: string }[];
   }
   ```
7. RBAC: call `requirePermission(ctx, "audit.view")` at the top of the handler.
8. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/auditLogs.ts` — `auditLogs.getFilterOptions` query with hardcoded grouped action types, hardcoded entity type list, and deduplicated recent actors from the last 100 log entries

### Acceptance Criteria

1. Returns all 11 action groups with the correct action strings in each group (matching the schema `action` union exactly).
2. Returns all 15 audited entity types from `AUDITED_TABLES`.
3. Returns recent actors deduplicated by `user_id` from the last 100 audit log entries.
4. System actor appears at most once in `recent_actors` with `user_id: null`.
5. Actors whose user records are not found are omitted from `recent_actors` (no nulls in the name field).
6. Gated by `audit.view` permission.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/auditLogs.ts`. Verify the return type is explicit and matches the format in Key Rule 6. Confirm action string lists match the schema `action` union in `convex/schema.ts` exactly (no missing or extra strings).

### Out of Scope

- Admin UI (P13-E02), audit log archival (V2), audit data export (V2).

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
