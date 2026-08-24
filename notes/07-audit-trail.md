# Audit Trail

> **Priority**: #13 in implementation order
> **Personas**: Admin (with `audit.view` permission)

## Purpose

Full accountability. Every significant action is logged: who did what, when, and what changed. When disputes arise (guard claims they weren't paid, owner claims no one called, admin claims guard submitted false info), the audit trail provides receipts.

## Implementation

Uses `convex-helpers/server/triggers` to automatically log every database mutation. No manual audit calls needed — if you use the wrapped `mutation` function, auditing is automatic.

### Trigger Setup

```typescript
// convex/functions.ts
import { Triggers } from "convex-helpers/server/triggers";

const triggers = new Triggers<DataModel>();

// Register triggers for all audited tables
const AUDITED_TABLES = [
  "societies", "buildings", "users", "guard_profiles",
  "guard_shifts", "leads", "owner_verifications",
  "listings", "visits", "closures", "payouts",
  "incentive_cards", "roles", "user_role_assignments", "system_config"
];

AUDITED_TABLES.forEach(table => {
  triggers.register(table, async (ctx, change) => {
    await ctx.db.insert("audit_logs", {
      actor_user_id: /* from auth context */,
      actor_type: /* GUARD / ADMIN / SYSTEM */,
      action: `${table.toUpperCase()}_${change.operation.toUpperCase()}`,
      entity_type: table,
      entity_id: change.id,
      changes: computeDiff(change.oldDoc, change.newDoc),
      metadata: { /* IP, browser if available */ },
    });
  });
});
```

### What Gets Logged

| Entity | Actions Logged |
|--------|---------------|
| Societies | Created, updated (name, status, etc.) |
| Buildings | Created, updated |
| Users | Created, status changed |
| Guard Profiles | Updated (type, society, metadata) |
| Guard Shifts | Created, updated, deleted |
| Leads | Created, status changed, updated by guard, bounty set |
| Owner Verifications | Created (each call attempt) |
| Listings | Created, updated, published, archived |
| Visits | Created, status changed (confirmed, started, completed, cancelled) |
| Closures | Created, confirmed |
| Payouts | Created (initiated), approved, paid |
| Incentive Cards | Suggested, confirmed, manually awarded, revoked |
| Roles | Created, updated, deleted |
| Role Assignments | Created, deleted |
| System Config | Updated |

### Change Diff Format

```json
{
  "changes": [
    { "field": "status", "old_value": "SUBMITTED", "new_value": "VERIFIED" },
    { "field": "notes_thread", "old_value": null, "new_value": "[{note: 'Called owner, confirmed vacancy', ...}]" }
  ]
}
```

---

## Admin Panel: Audit Log Viewer (`/admin/audit`)

### Table View

| Column | Description |
|--------|------------|
| Time | Timestamp (relative + absolute on hover) |
| Actor | User name + type badge (Guard/Admin/System) |
| Action | Human-readable action description |
| Entity | Entity type + link to entity |
| Changes | Expandable diff view |

### Filters

- **Actor**: Search by admin/guard name
- **Action**: Dropdown of action types
- **Entity Type**: societies, leads, visits, payouts, etc.
- **Entity ID**: Search for specific entity's history
- **Date Range**: From/To date picker

### Use Cases

1. **"When was this lead rejected and by whom?"** → Filter by entity_type=lead, entity_id=X
2. **"What did this admin do today?"** → Filter by actor, date=today
3. **"Show all payout status changes"** → Filter by action=PAYOUTS_UPDATE
4. **"What happened to this guard's status?"** → Filter by entity_type=users, entity_id=X

---

## Data Retention

- Audit logs are kept **indefinitely** in V1 (storage is cheap on Convex)
- Future consideration: archive logs older than 1 year to cold storage
- Cron job for potential cleanup: `crons.weekly("audit-cleanup", ...)` — configured but not active in V1

---

## Business Rules

1. Audit logs are **immutable**. No editing or deleting audit records.
2. System-triggered changes (de-dup flags, auto-suggestions) use `actor_type: "SYSTEM"`.
3. Audit viewer is read-only. No actions can be taken from the audit page.
4. All paginated (Convex pagination) — audit tables can grow large.
5. Audit does NOT log read operations (queries). Only mutations (inserts, updates, deletes).
